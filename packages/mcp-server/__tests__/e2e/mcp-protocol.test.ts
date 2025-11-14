/**
 * MCP 프로토콜 준수 테스트
 * MCP SDK Client를 사용하여 서버의 프로토콜 표준 준수 여부 검증
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('MCP Protocol Compliance', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let serverProcess: ChildProcess;
  let testVaultPath: string;
  let testIndexPath: string;

  beforeAll(async () => {
    // 테스트용 임시 디렉토리 생성
    testVaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-vault-'));
    testIndexPath = path.join(os.tmpdir(), `mcp-test-index-${Date.now()}.db`);

    // 서버 프로세스 시작
    // __dirname: packages/mcp-server/__tests__/e2e
    // serverPath: packages/mcp-server/dist/cli.js
    const serverPath = path.join(__dirname, '..', '..', 'dist', 'cli.js');

    serverProcess = spawn('node', [
      serverPath,
      '--vault', testVaultPath,
      '--index', testIndexPath,
      '--mode', 'dev'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Transport 및 Client 초기화
    transport = new StdioClientTransport({
      command: 'node',
      args: [
        serverPath,
        '--vault', testVaultPath,
        '--index', testIndexPath
      ]
    });

    client = new Client({
      name: 'mcp-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
  }, 30000); // 30초 타임아웃

  afterAll(async () => {
    // 정리
    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.error('Error closing client:', error);
      }
    }

    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise((resolve) => {
        serverProcess.once('exit', resolve);
        setTimeout(resolve, 2000); // Fallback timeout
      });
    }

    // 테스트 파일 정리
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
    if (fs.existsSync(testIndexPath)) {
      fs.unlinkSync(testIndexPath);
    }
  }, 10000);

  describe('서버 초기화 및 연결', () => {
    test('서버에 성공적으로 연결', () => {
      expect(client).toBeDefined();
    });

    test('서버 정보 조회 가능', async () => {
      const serverInfo = await client.getServerVersion();
      expect(serverInfo).toBeDefined();
    });
  });

  describe('Tool 목록 조회', () => {
    test('Tool 목록을 반환', async () => {
      const result = await client.listTools();
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    test('각 Tool이 유효한 스키마를 가짐', async () => {
      const result = await client.listTools();

      result.tools.forEach(tool => {
        // 필수 필드 검증
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');

        // inputSchema는 JSON Schema 형식이어야 함
        if (tool.inputSchema) {
          expect(tool.inputSchema.type).toBeDefined();
        }
      });
    });

    test('create_note 툴이 존재', async () => {
      const result = await client.listTools();
      const createNoteTool = result.tools.find(t => t.name === 'create_note');

      expect(createNoteTool).toBeDefined();
      expect(createNoteTool?.description).toBeTruthy();
      expect(createNoteTool?.inputSchema).toBeDefined();
    });

    test('search_memory 툴이 존재', async () => {
      const result = await client.listTools();
      const searchMemoryTool = result.tools.find(t => t.name === 'search_memory');

      expect(searchMemoryTool).toBeDefined();
      expect(searchMemoryTool?.description).toBeTruthy();
      expect(searchMemoryTool?.inputSchema).toBeDefined();
    });
  });

  describe('Tool 실행', () => {
    test('create_note 툴 실행 가능', async () => {
      const result = await client.callTool({
        name: 'create_note',
        arguments: {
          title: 'Test Note',
          content: 'This is a test note for MCP protocol compliance.',
          category: 'Resources'
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      // 결과가 TextContent 타입이어야 함
      if (result.content.length > 0) {
        const firstContent = result.content[0];
        expect(firstContent.type).toBe('text');
      }
    }, 15000);

    test('잘못된 Tool 이름으로 호출 시 적절한 에러 반환', async () => {
      await expect(
        client.callTool({
          name: 'non_existent_tool',
          arguments: {}
        })
      ).rejects.toThrow();
    });

    test('잘못된 인자로 Tool 호출 시 적절한 에러 반환', async () => {
      await expect(
        client.callTool({
          name: 'create_note',
          arguments: {
            // title이 누락됨
            content: 'Invalid note'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('에러 응답 형식', () => {
    test('에러가 MCP 표준 형식을 따름', async () => {
      try {
        await client.callTool({
          name: 'create_note',
          arguments: {
            title: 'Test',
            category: 'InvalidCategory' // 잘못된 category
          }
        });
        fail('에러가 발생해야 함');
      } catch (error: any) {
        // MCP 에러는 message 속성을 가져야 함
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
      }
    });
  });

  describe('Resource 목록 조회 (선택사항)', () => {
    test('Resource 목록 조회 시도', async () => {
      try {
        const result = await client.listResources();
        expect(result).toBeDefined();
      } catch (error) {
        // Resource를 지원하지 않는 경우 에러 발생 가능
        // 이는 선택사항이므로 테스트 실패로 간주하지 않음
        console.log('Resources not supported:', error);
      }
    });
  });

  describe('Prompt 목록 조회 (선택사항)', () => {
    test('Prompt 목록 조회 시도', async () => {
      try {
        const result = await client.listPrompts();
        expect(result).toBeDefined();
      } catch (error) {
        // Prompt를 지원하지 않는 경우 에러 발생 가능
        console.log('Prompts not supported:', error);
      }
    });
  });

  describe('통합 워크플로우', () => {
    test('노트 작성 → 검색 워크플로우', async () => {
      // 1. 노트 작성
      const uniqueTitle = `Integration Test Note ${Date.now()}`;
      const createResult = await client.callTool({
        name: 'create_note',
        arguments: {
          title: uniqueTitle,
          content: 'Integration test content for MCP compliance.',
          category: 'Resources',
          tags: ['test', 'mcp']
        }
      });

      expect(createResult).toBeDefined();

      // 2. 약간의 대기 (인덱싱 시간)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. 검색으로 찾기
      const searchResult = await client.callTool({
        name: 'search_memory',
        arguments: {
          query: uniqueTitle
        }
      });

      expect(searchResult).toBeDefined();
      expect(searchResult.content).toBeDefined();

      // 검색 결과에 작성한 노트가 포함되어야 함
      const resultText = JSON.stringify(searchResult.content);
      expect(resultText).toContain(uniqueTitle);
    }, 20000);
  });
});
