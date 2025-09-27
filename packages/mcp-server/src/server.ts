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
import { ErrorCode, MemoryMcpError, logger } from "@memory-mcp/common";
import {
  DEFAULT_EXECUTION_POLICY,
  executeTool,
  listTools,
} from "./tools/index.js";
import type { ToolExecutionContext } from "./tools/index.js";
import type { ExecutionPolicyOptions } from "./tools/execution-policy.js";
import type { ToolName } from "./tools/schemas.js";

export interface MemoryMcpServerOptions {
  vaultPath?: string;
  indexPath?: string;
  mode?: "dev" | "prod";
  policy?: Partial<ExecutionPolicyOptions>;
}

type ResolvedServerOptions = {
  vaultPath: string;
  indexPath: string;
  mode: "dev" | "prod";
  policy: ExecutionPolicyOptions;
};

const DEFAULT_OPTIONS: ResolvedServerOptions = {
  vaultPath: process.cwd(),
  indexPath: `${process.cwd()}/.memory-index.db`,
  mode: "dev",
  policy: DEFAULT_EXECUTION_POLICY,
};

/**
 * MCP 서버 클래스
 * JSON-RPC 2.0 기반으로 stdin/stdout를 통해 통신
 */
export class MemoryMCPServer {
  private readonly server: Server;
  private readonly options: ResolvedServerOptions;
  private readonly toolContext: ToolExecutionContext;

  constructor(options: MemoryMcpServerOptions = {}) {
    const resolvedPolicy: ExecutionPolicyOptions = {
      ...DEFAULT_EXECUTION_POLICY,
      ...options.policy,
    };

    const resolvedOptions: ResolvedServerOptions = {
      vaultPath: options.vaultPath ?? DEFAULT_OPTIONS.vaultPath,
      indexPath: options.indexPath ?? DEFAULT_OPTIONS.indexPath,
      mode: options.mode ?? DEFAULT_OPTIONS.mode,
      policy: resolvedPolicy,
    };

    this.options = resolvedOptions;

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

    this.toolContext = {
      vaultPath: this.options.vaultPath,
      indexPath: this.options.indexPath,
      mode: this.options.mode,
      logger,
      policy: this.options.policy,
    };

    this.setupToolHandlers();
  }

  /**
   * 툴 핸들러 설정
   */
  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: listTools(),
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const toolName = request.params.name as ToolName;
        const args = request.params.arguments ?? {};

        try {
          return await executeTool(toolName, args, this.toolContext);
        } catch (error) {
          logger.error(`Tool execution error for ${toolName}:`, error);

          if (error instanceof MemoryMcpError) {
            throw error;
          }

          throw new MemoryMcpError(
            ErrorCode.MCP_TOOL_ERROR,
            `툴 실행 중 예기치 못한 오류가 발생했습니다: ${String(error)}`,
            {
              tool: toolName,
            }
          );
        }
      }
    );
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    logger.info("Starting Memory MCP Server...", {
      vaultPath: this.options.vaultPath,
      indexPath: this.options.indexPath,
      mode: this.options.mode,
      policy: this.options.policy,
    });

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      await this.server.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      await this.server.close();
      process.exit(0);
    });

    await this.server.connect(transport);
    logger.info("Memory MCP Server started successfully");
  }
}

/**
 * 서버 인스턴스 생성 및 시작
 */
export async function startServer(
  options: MemoryMcpServerOptions = {}
): Promise<void> {
  const server = new MemoryMCPServer(options);
  await server.start();
}

// CLI에서 직접 실행될 때
if (require.main === module) {
  startServer().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}
