/**
 * 표준 에러 코드
 */
/* eslint-disable no-unused-vars */
export enum ErrorCode {
  // 파일 시스템 관련
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  INVALID_FILE_PATH = 'INVALID_FILE_PATH',

  // 스키마 검증 관련
  INVALID_FRONT_MATTER = 'INVALID_FRONT_MATTER',
  INVALID_UID = 'INVALID_UID',
  SCHEMA_VALIDATION_ERROR = 'SCHEMA_VALIDATION_ERROR',

  // 인덱스 관련
  INDEX_BUILD_ERROR = 'INDEX_BUILD_ERROR',
  INDEX_QUERY_ERROR = 'INDEX_QUERY_ERROR',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',

  // MCP 프로토콜 관련
  MCP_PROTOCOL_ERROR = 'MCP_PROTOCOL_ERROR',
  MCP_TOOL_ERROR = 'MCP_TOOL_ERROR',
  MCP_INVALID_REQUEST = 'MCP_INVALID_REQUEST',

  // 설정 관련
  CONFIG_ERROR = 'CONFIG_ERROR',
  VAULT_PATH_ERROR = 'VAULT_PATH_ERROR',

  // 일반적인 에러
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}
/* eslint-enable no-unused-vars */

/**
 * 기본 Memory MCP 에러 클래스
 */
export class MemoryMcpError extends Error {
  public readonly code: ErrorCode;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MemoryMcpError';
    this.code = code;
    if (metadata) {
      this.metadata = metadata;
    }

    // Error 클래스 상속을 위한 설정
    Object.setPrototypeOf(this, MemoryMcpError.prototype);
  }

  override toString(): string {
    const meta = this.metadata ? ` ${JSON.stringify(this.metadata)}` : '';
    return `${this.name} [${this.code}]: ${this.message}${meta}`;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
      stack: this.stack,
    };
  }
}

/**
 * 파일 시스템 관련 에러
 */
export class FileSystemError extends MemoryMcpError {
  public readonly filePath?: string;

  constructor(
    message: string,
    filePath?: string,
    code: ErrorCode = ErrorCode.FILE_READ_ERROR,
    metadata?: Record<string, unknown>
  ) {
    const mergedMetadata = {
      ...metadata,
      ...(filePath ? { filePath } : {}),
    };
    super(code, message, mergedMetadata);
    this.name = 'FileSystemError';
    this.filePath = filePath;
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

/**
 * 스키마 검증 에러
 */
export class ValidationError extends MemoryMcpError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    metadata?: Record<string, unknown>
  ) {
    const mergedMetadata = {
      ...metadata,
      ...(field !== undefined ? { field } : {}),
      ...(value !== undefined ? { value } : {}),
    };
    super(ErrorCode.SCHEMA_VALIDATION_ERROR, message, mergedMetadata);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 인덱스 관련 에러
 */
export class IndexError extends MemoryMcpError {
  constructor(
    code: ErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    super(code, message, metadata);
    this.name = 'IndexError';
  }
}

/**
 * MCP 프로토콜 에러
 */
export class ProtocolError extends MemoryMcpError {
  public readonly protocolCode?: string;

  constructor(
    message: string,
    protocolCode?: string,
    metadata?: Record<string, unknown>,
    code: ErrorCode = ErrorCode.MCP_PROTOCOL_ERROR
  ) {
    const mergedMetadata = {
      ...metadata,
      ...(protocolCode ? { protocolCode } : {}),
    };
    super(code, message, mergedMetadata);
    this.name = 'ProtocolError';
    this.protocolCode = protocolCode;
    Object.setPrototypeOf(this, ProtocolError.prototype);
  }
}

export function createErrorFromCode(
  code: ErrorCode,
  message: string,
  metadata?: Record<string, unknown>
): MemoryMcpError {
  switch (code) {
    case ErrorCode.FILE_NOT_FOUND:
    case ErrorCode.FILE_READ_ERROR:
    case ErrorCode.FILE_WRITE_ERROR:
    case ErrorCode.INVALID_FILE_PATH: {
      const filePath = metadata?.filePath as string | undefined;
      return new FileSystemError(message, filePath, code, metadata);
    }

    case ErrorCode.INVALID_FRONT_MATTER:
    case ErrorCode.INVALID_UID:
    case ErrorCode.SCHEMA_VALIDATION_ERROR: {
      const field = metadata?.field as string | undefined;
      const value = metadata?.value;
      return new ValidationError(message, field, value, metadata);
    }

    case ErrorCode.MCP_PROTOCOL_ERROR:
    case ErrorCode.MCP_TOOL_ERROR:
    case ErrorCode.MCP_INVALID_REQUEST: {
      const protocolCode = metadata?.protocolCode as string | undefined;
      return new ProtocolError(message, protocolCode, metadata, code);
    }

    default:
      return new MemoryMcpError(code, message, metadata);
  }
}

export function isMemoryMcpError(error: unknown): error is MemoryMcpError {
  return error instanceof MemoryMcpError;
}

export function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof MemoryMcpError) {
    const meta = error.metadata ? ` ${JSON.stringify(error.metadata)}` : '';
    return `${error.name} [${error.code}]: ${error.message}${meta}`;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return `알 수 없는 오류: ${JSON.stringify(error)}`;
  } catch {
    return '알 수 없는 오류';
  }
}

/**
 * 에러 생성 헬퍼 함수들
 */
export const createFileNotFoundError = (filePath: string): FileSystemError =>
  new FileSystemError(
    ErrorCode.FILE_NOT_FOUND,
    `파일을 찾을 수 없습니다: ${filePath}`,
    filePath
  );

export const createValidationError = (
  field: string,
  value: unknown
): ValidationError =>
  new ValidationError(`유효하지 않은 ${field}: ${String(value)}`);

export const createIndexError = (
  operation: string,
  details?: string
): IndexError =>
  new IndexError(
    ErrorCode.INDEX_BUILD_ERROR,
    `인덱스 ${operation} 실패${details ? `: ${details}` : ''}`,
    { operation, details }
  );
