import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { logger as baseLogger } from '@memory-mcp/common';
import type { z } from 'zod';
import type { ExecutionPolicyOptions } from './execution-policy.js';
import type { ToolName } from './schemas.js';

export type LoggerLike = Pick<
  typeof baseLogger,
  'debug' | 'info' | 'warn' | 'error'
>;

export interface ToolExecutionContext {
  vaultPath: string;
  indexPath: string;
  mode: 'dev' | 'prod';
  logger: LoggerLike;
  policy: ExecutionPolicyOptions;
}

export type ToolResult = CallToolResult;

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: ToolName;
  description: string;
  schema: TSchema;
  handler: (
    _input: z.infer<TSchema>,
    _context: ToolExecutionContext
  ) => Promise<ToolResult>;
}

export type AnyToolDefinition = ToolDefinition<z.ZodTypeAny>;
