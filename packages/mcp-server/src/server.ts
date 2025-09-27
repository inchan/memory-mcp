#!/usr/bin/env node

/**
 * @memory-mcp/mcp-server
 * MCP 서버 구현 - JSON-RPC 2.0 기반 stdin/stdout 통신
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@memory-mcp/common";

/**
 * MCP 서버 클래스
 * JSON-RPC 2.0 기반으로 stdin/stdout를 통해 통신
 */
class MemoryMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "memory-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  /**
   * 툴 핸들러 설정
   */
  private setupToolHandlers(): void {
    // 사용 가능한 툴 목록 반환
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_memory",
            description: "메모리에서 검색",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "검색할 키워드",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "create_note",
            description: "새 노트 생성",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "노트 제목",
                },
                content: {
                  type: "string",
                  description: "노트 내용",
                },
                category: {
                  type: "string",
                  description: "PARA 카테고리 (Projects/Areas/Resources/Archives)",
                  enum: ["Projects", "Areas", "Resources", "Archives"],
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "태그 목록",
                },
              },
              required: ["title", "content"],
            },
          },
        ],
      };
    });

    // 툴 실행 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_memory":
            return await this.handleSearchMemory(args);
          case "create_note":
            return await this.handleCreateNote(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Tool execution error for ${name}:`, error);
        throw error;
      }
    });
  }

  /**
   * 메모리 검색 핸들러
   */
  private async handleSearchMemory(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    // TODO: 실제 검색 로직 구현
    const { query } = args as { query: string };

    logger.info(`Searching memory for: ${query}`);

    return {
      content: [
        {
          type: "text",
          text: `검색 결과 (구현 예정): "${query}"에 대한 검색이 요청되었습니다.`,
        },
      ],
    };
  }

  /**
   * 노트 생성 핸들러
   */
  private async handleCreateNote(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    // TODO: 실제 노트 생성 로직 구현
    const { title, content, category = "Resources", tags = [] } = args as {
      title: string;
      content: string;
      category?: string;
      tags?: string[];
    };

    logger.info(`Creating note: ${title}`);

    return {
      content: [
        {
          type: "text",
          text: `노트 생성 완료 (구현 예정):
제목: ${title}
카테고리: ${category}
태그: ${tags.join(", ")}
내용 길이: ${content.length} 문자`,
        },
      ],
    };
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    logger.info("Starting Memory MCP Server...");

    // 에러 핸들링
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });

    // 서버 시작
    await this.server.connect(transport);
    logger.info("Memory MCP Server started successfully");
  }
}

/**
 * 서버 인스턴스 생성 및 시작
 */
export async function startServer(): Promise<void> {
  const server = new MemoryMCPServer();
  await server.start();
}

// CLI에서 직접 실행될 때
if (require.main === module) {
  startServer().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}