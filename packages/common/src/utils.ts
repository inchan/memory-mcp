import type { LogEntry, LogLevel } from './types';
import type { Uid } from './schemas';

// UID 생성을 위한 카운터 (고유성 보장)
let uidCounter = 0;

/**
 * 현재 타임스탬프로 UID 생성
 */
export function generateUid(): Uid {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  // 밀리초 + 카운터로 고유성 보장 (999를 넘으면 리셋)
  const milliseconds = now.getMilliseconds();
  uidCounter = (uidCounter + 1) % 1000;
  const uniqueId = (milliseconds * 1000 + uidCounter)
    .toString()
    .padStart(6, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}${uniqueId}Z` as Uid;
}

/**
 * 파일 경로를 정규화
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 파일 경로에서 확장자 제거
 */
export function removeExtension(filePath: string): string {
  return filePath.replace(/\.[^/.]+$/, '');
}

/**
 * Markdown 링크 파싱 ([[링크]], [텍스트](링크))
 */
export function parseMarkdownLinks(content: string): string[] {
  const wikiLinks = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g))
    .map(match => match[1]?.trim())
    .filter((link): link is string => Boolean(link));

  const mdLinks = Array.from(content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g))
    .map(match => match[2]?.trim())
    .filter((link): link is string => Boolean(link));

  return [...new Set([...wikiLinks, ...mdLinks])];
}

/**
 * 텍스트를 스니펫으로 변환 (검색 결과용)
 */
export function createSnippet(
  content: string,
  query: string,
  maxLength: number = 200
): string {
  const queryRegex = new RegExp(query, 'gi');
  const match = content.match(queryRegex);

  if (!match) {
    return (
      content.slice(0, maxLength) + (content.length > maxLength ? '...' : '')
    );
  }

  const matchIndex = content.search(queryRegex);
  const start = Math.max(0, matchIndex - maxLength / 2);
  const end = Math.min(content.length, start + maxLength);

  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * 민감정보 마스킹 (이메일, 전화번호 등)
 */
export function maskSensitiveInfo(text: string): string {
  return (
    text
      // 이메일 마스킹
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '***@***.***'
      )
      // 전화번호 마스킹 (한국 형식)
      .replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, '***-****-****')
      // 신용카드 번호 마스킹
      .replace(
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        '****-****-****-****'
      )
  );
}

/**
 * 구조적 로그 생성
 */
export function createLogEntry(
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
  component?: string,
  operation?: string
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata && { metadata }),
    ...(component && { component }),
    ...(operation && { operation }),
  };
}

/**
 * 디바운스 함수
 */
export function debounce<T extends (..._args: unknown[]) => unknown>(
  func: T,
  wait: number
): (..._args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...funcArgs: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...funcArgs), wait);
  };
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 간단한 로거 클래스
 */
class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

/**
 * 글로벌 로거 인스턴스
 */
export const logger = new Logger();
