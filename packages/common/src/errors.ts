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
  STORAGE_ERROR = 'STORAGE_ERROR',

  // 리소스 관련
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

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
  constructor(
    code: ErrorCode,
    message: string,
    filePath?: string,
    metadata?: Record<string, unknown>
  ) {
    super(code, message, { ...metadata, filePath });
    this.name = 'FileSystemError';
  }
}

/**
 * 스키마 검증 에러
 */
export class ValidationError extends MemoryMcpError {
  constructor(
    message: string,
    validationErrors?: unknown,
    metadata?: Record<string, unknown>
  ) {
    super(ErrorCode.SCHEMA_VALIDATION_ERROR, message, {
      ...metadata,
      validationErrors,
    });
    this.name = 'ValidationError';
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
export class McpProtocolError extends MemoryMcpError {
  constructor(
    code: ErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    super(code, message, metadata);
    this.name = 'McpProtocolError';
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
