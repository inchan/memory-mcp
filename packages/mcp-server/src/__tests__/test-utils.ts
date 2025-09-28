/**
 * 테스트 유틸리티 함수들
 * CLI, 서버 테스트를 위한 공통 헬퍼 함수 모음
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';

/**
 * 테스트용 임시 디렉토리 생성
 */
export async function createTempDirectory(prefix: string = 'mcp-server-test'): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return tempDir;
}

/**
 * 임시 디렉토리 정리
 */
export async function cleanupTempDirectory(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // 이미 삭제되었거나 접근할 수 없는 경우 무시
  }
}

/**
 * PARA 구조의 테스트 볼트 생성
 */
export async function createTestVault(vaultPath: string): Promise<void> {
  const paraCategories = ['Projects', 'Areas', 'Resources', 'Archives'];

  // 볼트 디렉토리 생성
  await fs.mkdir(vaultPath, { recursive: true });

  // PARA 카테고리 디렉토리 생성
  for (const category of paraCategories) {
    await fs.mkdir(path.join(vaultPath, category), { recursive: true });
  }

  // 테스트용 마크다운 파일 생성
  await fs.writeFile(
    path.join(vaultPath, 'Projects', 'test-project.md'),
    '---\nid: test-project-001\ntitle: Test Project\ncategory: Projects\ntags: [test]\n---\n\n# Test Project\n\nThis is a test project file.'
  );

  await fs.writeFile(
    path.join(vaultPath, 'Resources', 'test-resource.md'),
    '---\nid: test-resource-001\ntitle: Test Resource\ncategory: Resources\ntags: [test, resource]\n---\n\n# Test Resource\n\nThis is a test resource file.'
  );
}

/**
 * Commander.js 프로그램 테스트 실행 헬퍼
 */
export class CommandTestRunner {
  private program: Command;
  private exitCode: number | null = null;
  private output: string[] = [];
  private errors: string[] = [];

  constructor(program: Command) {
    this.program = program;
    this.setupMocks();
  }

  private setupMocks(): void {
    // process.exit 모킹
    const originalExit = process.exit;
    jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      this.exitCode = typeof code === 'number' ? code : (code ? 1 : 0);
      return undefined as never;
    });

    // console 출력 캡처
    jest.spyOn(console, 'log').mockImplementation((message: string) => {
      this.output.push(message);
    });

    jest.spyOn(console, 'error').mockImplementation((message: string) => {
      this.errors.push(message);
    });
  }

  /**
   * 명령어 실행
   */
  async run(args: string[]): Promise<{
    exitCode: number | null;
    output: string[];
    errors: string[];
  }> {
    try {
      await this.program.parseAsync(['node', 'test', ...args]);
    } catch (error) {
      // Commander.js에서 발생하는 에러는 정상적인 종료 처리
      if (error instanceof Error && error.message.includes('commander')) {
        // 정상적인 help 출력 등
      } else {
        this.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return {
      exitCode: this.exitCode,
      output: [...this.output],
      errors: [...this.errors],
    };
  }

  /**
   * 테스트 정리
   */
  cleanup(): void {
    jest.restoreAllMocks();
    this.exitCode = null;
    this.output = [];
    this.errors = [];
  }
}

/**
 * 비동기 이벤트 대기 헬퍼
 */
export function waitForEvent(emitter: NodeJS.EventEmitter, event: string, timeout: number = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * 프로세스 신호 모킹 헬퍼
 */
export class ProcessSignalMocker {
  private originalListeners: Map<string, Function[]> = new Map();

  constructor() {
    this.setupMocks();
  }

  private setupMocks(): void {
    // 기존 리스너 백업
    ['SIGINT', 'SIGTERM', 'unhandledRejection', 'uncaughtException'].forEach(signal => {
      const listeners = process.listeners(signal as any);
      this.originalListeners.set(signal, [...listeners]);
      process.removeAllListeners(signal as any);
    });

    // 모킹된 리스너 설정
    jest.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: (...args: any[]) => void) => {
      // 실제로는 리스너를 등록하지 않고 모킹
      return process;
    });
  }

  /**
   * 신호 발생 시뮬레이션
   */
  emitSignal(signal: string, ...args: any[]): void {
    process.emit(signal as any, ...args);
  }

  /**
   * 정리
   */
  restore(): void {
    jest.restoreAllMocks();

    // 원래 리스너 복원
    this.originalListeners.forEach((listeners, signal) => {
      process.removeAllListeners(signal as any);
      listeners.forEach(listener => {
        process.on(signal as any, listener as (...args: any[]) => void);
      });
    });
  }
}

/**
 * 테스트용 파일 시스템 모커
 */
export class FileSystemMocker {
  private mocks: { [key: string]: jest.MockedFunction<any> } = {};

  constructor() {
    this.setupMocks();
  }

  private setupMocks(): void {
    this.mocks.stat = jest.spyOn(fs, 'stat');
    this.mocks.access = jest.spyOn(fs, 'access');
    this.mocks.writeFile = jest.spyOn(fs, 'writeFile');
    this.mocks.unlink = jest.spyOn(fs, 'unlink');
    this.mocks.mkdir = jest.spyOn(fs, 'mkdir');
  }

  /**
   * 파일 존재 시뮬레이션
   */
  mockFileExists(filePath: string, isDirectory: boolean = false): void {
    this.mocks.access.mockImplementation(async (path: string) => {
      if (path === filePath) {
        return Promise.resolve();
      }
      throw new Error('File not found');
    });

    this.mocks.stat.mockImplementation(async (path: string) => {
      if (path === filePath) {
        return Promise.resolve({
          isFile: () => !isDirectory,
          isDirectory: () => isDirectory,
          size: 1024,
        } as any);
      }
      throw new Error('File not found');
    });
  }

  /**
   * 파일 없음 시뮬레이션
   */
  mockFileNotExists(filePath: string): void {
    this.mocks.access.mockImplementation(async (path: string) => {
      if (path === filePath) {
        throw new Error('ENOENT: no such file or directory');
      }
      return Promise.resolve();
    });

    this.mocks.stat.mockImplementation(async (path: string) => {
      if (path === filePath) {
        throw new Error('ENOENT: no such file or directory');
      }
      return Promise.resolve({} as any);
    });
  }

  /**
   * 파일 쓰기 성공 시뮬레이션
   */
  mockWriteSuccess(): void {
    this.mocks.writeFile.mockImplementation(async () => Promise.resolve());
    this.mocks.unlink.mockImplementation(async () => Promise.resolve());
    this.mocks.mkdir.mockImplementation(async () => Promise.resolve(''));
  }

  /**
   * 파일 쓰기 실패 시뮬레이션
   */
  mockWriteFailure(error: string = 'Permission denied'): void {
    this.mocks.writeFile.mockImplementation(async () => {
      throw new Error(error);
    });
  }

  /**
   * 정리
   */
  restore(): void {
    Object.values(this.mocks).forEach(mock => {
      mock.mockRestore();
    });
  }
}