/**
 * 유닛 테스트를 위한 공통 헬퍼 함수들
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ToolExecutionContext } from '../../src/tools/types';

/**
 * 테스트용 임시 디렉토리 생성
 */
export function createTempDir(prefix: string = 'memory-mcp-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * 테스트용 ToolExecutionContext 생성
 */
export function createTestContext(
  overrides: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
  const tempDir = createTempDir();
  const vaultPath = overrides.vaultPath || path.join(tempDir, 'vault');
  const indexPath = overrides.indexPath || path.join(tempDir, 'index.db');

  // Ensure vault directory exists
  if (!fs.existsSync(vaultPath)) {
    fs.mkdirSync(vaultPath, { recursive: true });
  }

  return {
    vaultPath,
    indexPath,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    policy: {
      maxRetries: 1,
      timeoutMs: 5000,
    },
    mode: 'dev',
    ...overrides,
  };
}

/**
 * 테스트 정리 헬퍼
 */
export function cleanupTestContext(context: ToolExecutionContext): void {
  try {
    const tempDir = path.dirname(context.vaultPath);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Mock 노트 데이터 생성
 */
export function createMockNote(overrides: any = {}) {
  return {
    title: 'Test Note',
    content: 'This is test content',
    category: 'Resources',
    tags: ['test'],
    ...overrides,
  };
}
