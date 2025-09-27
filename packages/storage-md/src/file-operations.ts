/**
 * 파일 시스템 조작을 위한 기본 유틸리티
 */

import { promises as fs, constants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '@memory-mcp/common';
import { FileSystemError, WriteFileOptions, ReadFileOptions } from './types';

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  createDirs?: boolean;
}

export interface ListMarkdownFilesOptions {
  recursive?: boolean;
  pattern?: RegExp;
}

export interface MarkdownFileEntry {
  name: string;
  path: string;
  relativePath: string;
}

/**
 * 재시도 옵션
 */
interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 1000,
};

/**
 * 지수 백오프로 함수 재시도
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 마지막 시도면 오류 던지기
      if (attempt === options.maxRetries) {
        break;
      }

      // 일시적 오류가 아니면 즉시 실패
      if (!isTemporaryError(error)) {
        break;
      }

      // 지수 백오프 지연
      const delay = Math.min(
        options.baseDelay * Math.pow(2, attempt),
        options.maxDelay
      );

      logger.debug(`파일 작업 재시도 중 (${attempt + 1}/${options.maxRetries}), ${delay}ms 대기`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 일시적 오류인지 판단
 */
function isTemporaryError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return ['EMFILE', 'ENFILE', 'EBUSY', 'EAGAIN'].includes(code);
  }
  return false;
}

/**
 * 지연 함수
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 경로 정규화 (OS 호환성)
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * 디렉토리가 존재하는지 확인
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 파일이 존재하는지 확인
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 디렉토리 재귀적 생성
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await withRetry(async () => {
      await fs.mkdir(dirPath, { recursive: true });
    });

    logger.debug(`디렉토리 생성 완료: ${dirPath}`);
  } catch (error) {
    throw new FileSystemError(
      `디렉토리 생성 실패: ${dirPath}`,
      dirPath,
      error
    );
  }
}

/**
 * 파일 읽기
 */
export async function readFile(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<string> {
  const { encoding = 'utf8' } = options;

  try {
    const content = await withRetry(async () => {
      return await fs.readFile(filePath, { encoding });
    });

    logger.debug(`파일 읽기 완료: ${filePath} (${content.length} 문자)`);
    return content;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;

      if (code === 'ENOENT') {
        throw new FileSystemError(
          `파일을 찾을 수 없습니다: ${filePath}`,
          filePath,
          error
        );
      }

      if (code === 'EACCES') {
        throw new FileSystemError(
          `파일 읽기 권한이 없습니다: ${filePath}`,
          filePath,
          error
        );
      }
    }

    throw new FileSystemError(
      `파일 읽기 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

/**
 * 파일 쓰기 (일반)
 */
export async function writeFile(
  filePath: string,
  content: string,
  options: WriteFileOptions = {}
): Promise<void> {
  const {
    encoding = 'utf8',
    atomic = true,
    ensureDir = true,
  } = options;

  if (atomic) {
    return await atomicWriteFile(filePath, content, { encoding, ensureDir });
  }

  try {
    if (ensureDir) {
      const dir = path.dirname(filePath);
      await ensureDirectory(dir);
    }

    await withRetry(async () => {
      await fs.writeFile(filePath, content, { encoding });
    });

    logger.debug(`파일 쓰기 완료: ${filePath} (${content.length} 문자)`);
  } catch (error) {
    throw new FileSystemError(
      `파일 쓰기 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

/**
 * 원자적 파일 쓰기 (임시 파일 + rename)
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  options: { encoding?: BufferEncoding; ensureDir?: boolean } = {}
): Promise<void> {
  const { encoding = 'utf8', ensureDir = true } = options;

  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const tempFileName = `.${fileName}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tempFilePath = path.join(dir, tempFileName);

  try {
    if (ensureDir) {
      await ensureDirectory(dir);
    }

    // 임시 파일에 쓰기
    await withRetry(async () => {
      await fs.writeFile(tempFilePath, content, { encoding });
    });

    // 원자적 이동 (rename)
    await withRetry(async () => {
      await fs.rename(tempFilePath, filePath);
    });

    logger.debug(`원자적 파일 쓰기 완료: ${filePath} (${content.length} 문자)`);
  } catch (error) {
    // 임시 파일 정리
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // 임시 파일 삭제 실패는 무시
    }

    throw new FileSystemError(
      `원자적 파일 쓰기 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

export async function atomicWrite(
  filePath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const { encoding = 'utf8', createDirs = true } = options;
  await atomicWriteFile(filePath, content, {
    encoding,
    ensureDir: createDirs,
  });
}

export async function safeRead(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<string> {
  return readFile(filePath, options);
}

export async function getFileInfo(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return {
      path: normalizePath(filePath),
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      created: new Date(stats.birthtime),
      modified: new Date(stats.mtime),
    };
  } catch (error) {
    throw new FileSystemError(
      `파일 정보 조회 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

export async function listMarkdownFiles(
  dirPath: string,
  options: ListMarkdownFilesOptions = {}
): Promise<MarkdownFileEntry[]> {
  const { recursive = false, pattern } = options;
  const markdownPattern = /\.(md|markdown)$/i;
  const files = await listFiles(dirPath, markdownPattern, recursive);
  const filtered = pattern
    ? files.filter(file => {
        const name = path.basename(file);
        if (pattern.global) {
          pattern.lastIndex = 0;
        }
        return pattern.test(name);
      })
    : files;

  return filtered.map(file => ({
    name: path.basename(file),
    path: file,
    relativePath: normalizePath(path.relative(dirPath, file)),
  }));
}

/**
 * 파일 삭제
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await withRetry(async () => {
      await fs.unlink(filePath);
    });

    logger.debug(`파일 삭제 완료: ${filePath}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;

      if (code === 'ENOENT') {
        // 파일이 없으면 성공으로 간주
        logger.debug(`파일이 이미 없음: ${filePath}`);
        return;
      }
    }

    throw new FileSystemError(
      `파일 삭제 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

/**
 * 파일 이동/이름 변경
 */
export async function moveFile(oldPath: string, newPath: string): Promise<void> {
  try {
    const newDir = path.dirname(newPath);
    await ensureDirectory(newDir);

    await withRetry(async () => {
      await fs.rename(oldPath, newPath);
    });

    logger.debug(`파일 이동 완료: ${oldPath} → ${newPath}`);
  } catch (error) {
    throw new FileSystemError(
      `파일 이동 실패: ${oldPath} → ${newPath}`,
      oldPath,
      error
    );
  }
}

/**
 * 파일 복사
 */
export async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    const targetDir = path.dirname(targetPath);
    await ensureDirectory(targetDir);

    await withRetry(async () => {
      await fs.copyFile(sourcePath, targetPath);
    });

    logger.debug(`파일 복사 완료: ${sourcePath} → ${targetPath}`);
  } catch (error) {
    throw new FileSystemError(
      `파일 복사 실패: ${sourcePath} → ${targetPath}`,
      sourcePath,
      error
    );
  }
}

/**
 * 파일 통계 정보 조회
 */
export async function getFileStats(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      birthtime: stats.birthtime,
      mtime: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (error) {
    throw new FileSystemError(
      `파일 정보 조회 실패: ${filePath}`,
      filePath,
      error
    );
  }
}

/**
 * 콘텐츠 해시 생성 (SHA-256)
 */
export function createContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * 디렉토리 내 파일 목록 조회 (재귀적)
 */
export async function listFiles(
  dirPath: string,
  pattern?: RegExp,
  recursive: boolean = true
): Promise<string[]> {
  const files: string[] = [];

  try {
    await walkDirectory(dirPath, (filePath, stats) => {
      if (stats.isFile()) {
        if (!pattern || pattern.test(filePath)) {
          files.push(normalizePath(filePath));
        }
      }
    }, recursive);

    return files.sort();
  } catch (error) {
    throw new FileSystemError(
      `디렉토리 스캔 실패: ${dirPath}`,
      dirPath,
      error
    );
  }
}

/**
 * 디렉토리 순회
 */
async function walkDirectory(
  dirPath: string,
  callback: (filePath: string, stats: any) => void,
  recursive: boolean = true
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      await walkDirectory(fullPath, callback, recursive);
    } else if (entry.isFile()) {
      const stats = await fs.stat(fullPath);
      callback(fullPath, stats);
    }
  }
}

/**
 * 안전한 파일명 생성 (특수 문자 제거)
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*]/g, '-')  // 윈도우 금지 문자
    .replace(/\s+/g, '-')          // 공백을 대시로
    .replace(/-+/g, '-')           // 연속 대시 합치기
    .replace(/^-|-$/g, '');        // 시작/끝 대시 제거
}

/**
 * 상대 경로를 절대 경로로 변환
 */
export function resolveAbsolutePath(filePath: string, basePath?: string): string {
  if (path.isAbsolute(filePath)) {
    return normalizePath(filePath);
  }

  const base = basePath || process.cwd();
  return normalizePath(path.resolve(base, filePath));
}