import { ErrorCode, MemoryMcpError } from '@memory-mcp/common';

type RetryHook = (_context: { attempt: number; error: unknown }) => void;

export interface ExecutionPolicyOptions {
  /**
   * 최대 재시도 횟수 (추가 시도 수). 0이면 단일 시도만 수행.
   */
  maxRetries: number;
  /**
   * 각 시도당 허용되는 최대 실행 시간 (ms).
   */
  timeoutMs: number;
  /**
   * 재시도 직전에 호출되는 훅.
   */
  onRetry?: RetryHook;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicyOptions = {
  maxRetries: 2,
  timeoutMs: 5_000,
};

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  if (timeoutMs <= 0) {
    return operation();
  }

  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new MemoryMcpError(
            ErrorCode.TIMEOUT_ERROR,
            `툴 실행이 ${timeoutMs}ms 제한을 초과했습니다.`
          )
        );
      }, timeoutMs);
    });

    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function withExecutionPolicy<T>(
  operation: () => Promise<T>,
  options: ExecutionPolicyOptions
): Promise<T> {
  const { maxRetries, timeoutMs, onRetry } = options;
  const totalAttempts = Math.max(0, maxRetries) + 1;

  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await withTimeout(operation, timeoutMs);
    } catch (error) {
      lastError = error;

      if (attempt >= totalAttempts) {
        if (error instanceof MemoryMcpError) {
          throw error;
        }

        throw new MemoryMcpError(
          ErrorCode.MCP_TOOL_ERROR,
          '툴 실행 중 예기치 못한 오류가 발생했습니다.',
          {
            cause: error instanceof Error ? error.message : String(error),
          }
        );
      }

      onRetry?.({ attempt, error });
    }
  }

  throw new MemoryMcpError(
    ErrorCode.INTERNAL_ERROR,
    '툴 실행 정책을 적용하는 동안 알 수 없는 오류가 발생했습니다.',
    { lastError }
  );
}
