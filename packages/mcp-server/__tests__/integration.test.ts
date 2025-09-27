/**
 * MCP 서버 통합 테스트
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { MemoryMCPServer } from '../src/server';

describe('MCP Server Integration', () => {
  const testDir = join(tmpdir(), 'mcp-integration-test', Date.now().toString());
  let server: MemoryMCPServer;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 정리 실패는 무시
    }
  });

  beforeEach(() => {
    server = new MemoryMCPServer({
      vaultPath: testDir,
      indexPath: join(testDir, 'test-index.db'),
      mode: 'dev',
    });
  });

  test('서버 초기화', () => {
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(MemoryMCPServer);
  });

  // 실제 MCP 통신 테스트는 복잡하므로 기본적인 구조만 검증
  test('서버 옵션 설정 확인', () => {
    const serverWithOptions = new MemoryMCPServer({
      vaultPath: '/custom/vault',
      indexPath: '/custom/index.db',
      mode: 'prod',
      policy: {
        maxRetries: 5,
        timeoutMs: 10000,
      },
    });

    expect(serverWithOptions).toBeDefined();
  });

  test.skip('실제 MCP 프로토콜 테스트', async () => {
    // 실제 stdin/stdout 기반 통신 테스트는 복잡하므로 스킵
    // E2E 테스트에서 별도로 구현
  });
});