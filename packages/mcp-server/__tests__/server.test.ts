/**
 * MCP 서버 기본 기능 테스트
 */

import { MemoryMCPServer, type MemoryMcpServerOptions } from '../src/server';

describe('MemoryMCPServer', () => {
  describe('서버 옵션 처리', () => {
    test('기본 옵션으로 서버 생성', () => {
      const server = new MemoryMCPServer();
      expect(server).toBeInstanceOf(MemoryMCPServer);
    });

    test('사용자 정의 옵션으로 서버 생성', () => {
      const options: MemoryMcpServerOptions = {
        vaultPath: '/custom/vault',
        indexPath: '/custom/index.db',
        mode: 'prod',
      };

      const server = new MemoryMCPServer(options);
      expect(server).toBeInstanceOf(MemoryMCPServer);
    });
  });

  describe('서버 생명주기', () => {
    let server: MemoryMCPServer;

    beforeEach(() => {
      server = new MemoryMCPServer();
    });

    test('서버가 정상적으로 초기화됨', () => {
      expect(server).toBeDefined();
    });

    // 실제 stdio 연결이 필요한 테스트는 스킵
    test.skip('서버 시작 및 종료', async () => {
      // 통합 테스트에서 구현
    });
  });
});