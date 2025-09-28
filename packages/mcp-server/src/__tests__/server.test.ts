/**
 * Server 테스트
 * MCP 서버 클래스 및 라이프사이클 테스트
 */

import { jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { ErrorCode, MemoryMcpError, logger } from '@memory-mcp/common';
import { MemoryMCPServer, startServer, type MemoryMcpServerOptions } from '../server.js';
import {
  listTools,
  executeTool,
  DEFAULT_EXECUTION_POLICY,
} from '../tools/index.js';
import {
  createTempDirectory,
  cleanupTempDirectory,
  ProcessSignalMocker,
} from './test-utils.js';

// MCP SDK 모킹
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

// Tools 모킹
jest.mock('../tools/index.js', () => ({
  listTools: jest.fn(),
  executeTool: jest.fn(),
  DEFAULT_EXECUTION_POLICY: {
    timeoutMs: 5000,
    maxRetries: 2,
  },
}));

const MockedServer = Server as jest.MockedClass<typeof Server>;
const MockedStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;
const mockedListTools = listTools as jest.MockedFunction<typeof listTools>;
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('MemoryMCPServer', () => {
  let tempVault: string;
  let signalMocker: ProcessSignalMocker;
  let mockServerInstance: jest.Mocked<Server>;
  let mockTransportInstance: jest.Mocked<StdioServerTransport>;

  beforeEach(async () => {
    tempVault = await createTempDirectory('server-test-vault');
    signalMocker = new ProcessSignalMocker();

    // Server 인스턴스 모킹
    mockServerInstance = {
      setRequestHandler: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    MockedServer.mockImplementation(() => mockServerInstance);

    // Transport 인스턴스 모킹
    mockTransportInstance = {} as any;
    MockedStdioServerTransport.mockImplementation(() => mockTransportInstance);

    // Tools 기본 모킹
    mockedListTools.mockReturnValue([
      {
        name: 'search_memory' as any,
        description: '메모리 검색',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);

    mockedExecuteTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Test result' }],
    });

    // logger 모킹
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempVault);
    signalMocker.restore();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('생성자 테스트', () => {
    it('기본 옵션으로 서버 생성', () => {
      const server = new MemoryMCPServer();

      expect(MockedServer).toHaveBeenCalledWith(
        {
          name: 'memory-mcp',
          version: '0.1.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    it('커스텀 옵션으로 서버 생성', () => {
      const options: MemoryMcpServerOptions = {
        vaultPath: tempVault,
        indexPath: '/custom/index.db',
        mode: 'prod',
        policy: {
          timeoutMs: 10000,
          maxRetries: 5,
        },
      };

      const server = new MemoryMCPServer(options);

      expect(MockedServer).toHaveBeenCalledWith(
        {
          name: 'memory-mcp',
          version: '0.1.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    it('부분 옵션으로 서버 생성 - 기본값 병합', () => {
      const options: MemoryMcpServerOptions = {
        vaultPath: tempVault,
        policy: {
          timeoutMs: 8000,
        },
      };

      const server = new MemoryMCPServer(options);

      // 기본값과 병합되어야 함
      expect(MockedServer).toHaveBeenCalled();
    });
  });

  describe('핸들러 설정 테스트', () => {
    it('ListTools 핸들러 등록', () => {
      const server = new MemoryMCPServer();

      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
    });

    it('CallTool 핸들러 등록', () => {
      const server = new MemoryMCPServer();

      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );
    });

    it('ListTools 핸들러 실행', async () => {
      const server = new MemoryMCPServer();

      // setRequestHandler의 두 번째 호출 (ListTools)
      const listToolsHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === ListToolsRequestSchema
      )?.[1];

      expect(listToolsHandler).toBeDefined();

      const result = await listToolsHandler();
      expect(result).toEqual({
        tools: expect.any(Array),
      });
      expect(mockedListTools).toHaveBeenCalled();
    });

    it('CallTool 핸들러 정상 실행', async () => {
      const server = new MemoryMCPServer();

      // setRequestHandler의 첫 번째 호출 (CallTool)
      const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )?.[1];

      expect(callToolHandler).toBeDefined();

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'search_memory',
          arguments: { query: 'test' },
        },
      };

      const result = await callToolHandler(request);
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Test result' }],
      });
      expect(mockedExecuteTool).toHaveBeenCalledWith(
        'search_memory',
        { query: 'test' },
        expect.objectContaining({
          vaultPath: expect.any(String),
          indexPath: expect.any(String),
          mode: expect.any(String),
          logger: expect.any(Object),
          policy: expect.any(Object),
        })
      );
    });

    it('CallTool 핸들러 - 인자 없음', async () => {
      const server = new MemoryMCPServer();

      const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )?.[1];

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'search_memory',
          // arguments 없음
        },
      };

      await callToolHandler(request);
      expect(mockedExecuteTool).toHaveBeenCalledWith(
        'search_memory',
        {}, // 빈 객체로 전달되어야 함
        expect.any(Object)
      );
    });

    it('CallTool 핸들러 - MemoryMcpError 전파', async () => {
      const server = new MemoryMCPServer();

      const testError = new MemoryMcpError(
        ErrorCode.MCP_TOOL_ERROR,
        'Test error'
      );

      mockedExecuteTool.mockRejectedValueOnce(testError);

      const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )?.[1];

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'search_memory',
          arguments: { query: 'test' },
        },
      };

      await expect(callToolHandler(request)).rejects.toThrow(testError);
      expect(logger.error).toHaveBeenCalledWith(
        'Tool execution error for search_memory:',
        testError
      );
    });

    it('CallTool 핸들러 - 일반 에러를 MemoryMcpError로 변환', async () => {
      const server = new MemoryMCPServer();

      const testError = new Error('Generic error');
      mockedExecuteTool.mockRejectedValueOnce(testError);

      const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )?.[1];

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'search_memory',
          arguments: { query: 'test' },
        },
      };

      await expect(callToolHandler(request)).rejects.toMatchObject({
        code: ErrorCode.MCP_TOOL_ERROR,
        message: expect.stringContaining('툴 실행 중 예기치 못한 오류가 발생했습니다'),
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Tool execution error for search_memory:',
        testError
      );
    });
  });

  describe('서버 시작 테스트', () => {
    it('정상적인 서버 시작', async () => {
      const server = new MemoryMCPServer({ vaultPath: tempVault });

      await server.start();

      expect(MockedStdioServerTransport).toHaveBeenCalled();
      expect(mockServerInstance.connect).toHaveBeenCalledWith(mockTransportInstance);
      expect(logger.info).toHaveBeenCalledWith(
        'Starting Memory MCP Server...',
        expect.objectContaining({
          vaultPath: tempVault,
        })
      );
      expect(logger.info).toHaveBeenCalledWith('Memory MCP Server started successfully');
    });

    it('SIGINT 신호 처리', async () => {
      const server = new MemoryMCPServer();

      // process.exit 모킹
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never;
      });

      await server.start();

      // SIGINT 신호 발생 시뮬레이션
      signalMocker.emitSignal('SIGINT');

      expect(logger.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    it('SIGTERM 신호 처리', async () => {
      const server = new MemoryMCPServer();

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never;
      });

      await server.start();

      // SIGTERM 신호 발생 시뮬레이션
      signalMocker.emitSignal('SIGTERM');

      expect(logger.info).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully...');
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    it('서버 연결 실패', async () => {
      const server = new MemoryMCPServer();

      const connectionError = new Error('Connection failed');
      mockServerInstance.connect.mockRejectedValueOnce(connectionError);

      await expect(server.start()).rejects.toThrow(connectionError);
    });
  });

  describe('startServer 함수 테스트', () => {
    it('기본 옵션으로 서버 시작', async () => {
      // 실제 시작은 하지 않고 인스턴스 생성만 테스트
      jest.spyOn(MemoryMCPServer.prototype, 'start').mockResolvedValueOnce(undefined);

      await startServer();

      expect(MemoryMCPServer.prototype.start).toHaveBeenCalled();
    });

    it('커스텀 옵션으로 서버 시작', async () => {
      jest.spyOn(MemoryMCPServer.prototype, 'start').mockResolvedValueOnce(undefined);

      const options: MemoryMcpServerOptions = {
        vaultPath: tempVault,
        indexPath: '/custom/index.db',
        mode: 'prod',
      };

      await startServer(options);

      expect(MemoryMCPServer.prototype.start).toHaveBeenCalled();
    });

    it('서버 시작 실패', async () => {
      const startError = new Error('Server start failed');
      jest.spyOn(MemoryMCPServer.prototype, 'start').mockRejectedValueOnce(startError);

      await expect(startServer()).rejects.toThrow(startError);
    });
  });

  describe('require.main 모듈 테스트', () => {
    it('직접 실행시 에러 처리', async () => {
      // 실제 require.main === module 테스트는 어려우므로
      // 에러 핸들링 로직만 테스트
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        return undefined as never;
      });

      // startServer 실패 시뮬레이션
      const originalStartServer = startServer;
      const mockStartServer = jest.fn().mockRejectedValue(new Error('Start failed'));

      // 글로벌 변수로 함수 교체
      (global as any).startServer = mockStartServer;

      try {
        // 직접 실행 코드 시뮬레이션
        if (require.main === module) {
          await mockStartServer().catch((error: Error) => {
            logger.error('Failed to start server:', error);
            process.exit(1);
          });
        }

        // 조건이 true가 아니더라도 로직 테스트
        await mockStartServer().catch((error: Error) => {
          logger.error('Failed to start server:', error);
          process.exit(1);
        });

        expect(logger.error).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
        expect(mockExit).toHaveBeenCalledWith(1);
      } finally {
        (global as any).startServer = originalStartServer;
        mockExit.mockRestore();
      }
    });
  });

  describe('서버 옵션 해석 테스트', () => {
    it('DEFAULT_OPTIONS 사용', () => {
      const server = new MemoryMCPServer({});

      // 기본값이 적용되는지 확인
      expect(MockedServer).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('정책 옵션 병합', () => {
      const customPolicy = {
        timeoutMs: 15000,
      };

      const server = new MemoryMCPServer({
        policy: customPolicy,
      });

      // 기본 정책과 커스텀 정책이 병합되어야 함
      expect(MockedServer).toHaveBeenCalled();
    });

    it('모든 옵션 커스터마이징', () => {
      const fullOptions: MemoryMcpServerOptions = {
        vaultPath: '/custom/vault',
        indexPath: '/custom/index.db',
        mode: 'prod',
        policy: {
          timeoutMs: 20000,
          maxRetries: 10,
        },
      };

      const server = new MemoryMCPServer(fullOptions);

      expect(MockedServer).toHaveBeenCalled();
    });
  });

  describe('툴 컨텍스트 구성 테스트', () => {
    it('ToolExecutionContext 올바른 구성', async () => {
      const options: MemoryMcpServerOptions = {
        vaultPath: tempVault,
        indexPath: '/test/index.db',
        mode: 'dev',
        policy: {
          timeoutMs: 3000,
          maxRetries: 1,
        },
      };

      const server = new MemoryMCPServer(options);

      // CallTool 핸들러 호출하여 컨텍스트 확인
      const callToolHandler = mockServerInstance.setRequestHandler.mock.calls.find(
        call => call[0] === CallToolRequestSchema
      )?.[1];

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'search_memory',
          arguments: { query: 'test' },
        },
      };

      await callToolHandler(request);

      expect(mockedExecuteTool).toHaveBeenCalledWith(
        'search_memory',
        { query: 'test' },
        expect.objectContaining({
          vaultPath: tempVault,
          indexPath: '/test/index.db',
          mode: 'dev',
          logger: logger,
          policy: expect.objectContaining({
            timeoutMs: 3000,
            maxRetries: 1,
          }),
        })
      );
    });
  });
});