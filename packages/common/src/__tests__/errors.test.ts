/**
 * 에러 클래스 및 헬퍼 함수 테스트
 *
 * 커버리지 목표: 78% → 95%+
 * 미테스트: FileSystemError, ValidationError, IndexError, McpProtocolError,
 *          createFileNotFoundError, createValidationError, createIndexError
 */

import {
  ErrorCode,
  MemoryMcpError,
  FileSystemError,
  ValidationError,
  IndexError,
  McpProtocolError,
  createFileNotFoundError,
  createValidationError,
  createIndexError,
} from '../errors';

describe('에러 클래스 테스트', () => {
  describe('MemoryMcpError', () => {
    it('should create error with code and message', () => {
      const error = new MemoryMcpError(
        ErrorCode.INTERNAL_ERROR,
        'Internal error occurred'
      );

      expect(error.name).toBe('MemoryMcpError');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe('Internal error occurred');
      expect(error.metadata).toBeUndefined();
    });

    it('should create error with metadata', () => {
      const metadata = { key: 'value', count: 10 };
      const error = new MemoryMcpError(
        ErrorCode.CONFIG_ERROR,
        'Config error',
        metadata
      );

      expect(error.metadata).toEqual(metadata);
    });

    it('should be instanceof Error', () => {
      const error = new MemoryMcpError(ErrorCode.TIMEOUT_ERROR, 'Timeout');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MemoryMcpError);
    });

    it('should serialize to JSON correctly', () => {
      const error = new MemoryMcpError(
        ErrorCode.NETWORK_ERROR,
        'Network failed',
        { retry: true }
      );

      const json = error.toJSON();

      expect(json.name).toBe('MemoryMcpError');
      expect(json.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(json.message).toBe('Network failed');
      expect(json.metadata).toEqual({ retry: true });
      expect(json.stack).toBeDefined();
    });

    it('should preserve stack trace', () => {
      const error = new MemoryMcpError(ErrorCode.INTERNAL_ERROR, 'Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MemoryMcpError');
    });
  });

  describe('FileSystemError', () => {
    it('should create error with file path', () => {
      const error = new FileSystemError(
        ErrorCode.FILE_NOT_FOUND,
        'File not found',
        '/path/to/file.md'
      );

      expect(error.name).toBe('FileSystemError');
      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.message).toBe('File not found');
      expect(error.metadata?.filePath).toBe('/path/to/file.md');
    });

    it('should merge additional metadata', () => {
      const error = new FileSystemError(
        ErrorCode.FILE_WRITE_ERROR,
        'Write failed',
        '/test.md',
        { reason: 'disk full' }
      );

      expect(error.metadata?.filePath).toBe('/test.md');
      expect(error.metadata?.reason).toBe('disk full');
    });

    it('should handle undefined file path', () => {
      const error = new FileSystemError(
        ErrorCode.STORAGE_ERROR,
        'Storage issue'
      );

      expect(error.metadata?.filePath).toBeUndefined();
    });

    it('should be instanceof MemoryMcpError', () => {
      const error = new FileSystemError(
        ErrorCode.FILE_READ_ERROR,
        'Read error',
        '/file.txt'
      );

      expect(error.name).toBe('FileSystemError');
      expect(error).toBeInstanceOf(MemoryMcpError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ValidationError', () => {
    it('should create error with validation details', () => {
      const validationErrors = [
        { path: 'title', message: 'Required' },
        { path: 'id', message: 'Invalid format' },
      ];
      const error = new ValidationError('Validation failed', validationErrors);

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCode.SCHEMA_VALIDATION_ERROR);
      expect(error.message).toBe('Validation failed');
      expect(error.metadata?.validationErrors).toEqual(validationErrors);
    });

    it('should handle no validation errors', () => {
      const error = new ValidationError('Invalid data');

      expect(error.metadata?.validationErrors).toBeUndefined();
    });

    it('should merge additional metadata', () => {
      const error = new ValidationError('Invalid', null, {
        field: 'email',
        value: 'test',
      });

      expect(error.metadata?.field).toBe('email');
      expect(error.metadata?.value).toBe('test');
    });

    it('should be instanceof MemoryMcpError', () => {
      const error = new ValidationError('Test');

      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(MemoryMcpError);
    });
  });

  describe('IndexError', () => {
    it('should create error with code and message', () => {
      const error = new IndexError(
        ErrorCode.INDEX_BUILD_ERROR,
        'Index build failed'
      );

      expect(error.name).toBe('IndexError');
      expect(error.code).toBe(ErrorCode.INDEX_BUILD_ERROR);
      expect(error.message).toBe('Index build failed');
    });

    it('should include metadata', () => {
      const error = new IndexError(
        ErrorCode.INDEX_CORRUPTED,
        'Index corrupted',
        { indexPath: '/index.db', reason: 'checksum mismatch' }
      );

      expect(error.metadata?.indexPath).toBe('/index.db');
      expect(error.metadata?.reason).toBe('checksum mismatch');
    });

    it('should handle different index error codes', () => {
      const queryError = new IndexError(
        ErrorCode.INDEX_QUERY_ERROR,
        'Query failed'
      );

      expect(queryError.code).toBe(ErrorCode.INDEX_QUERY_ERROR);
    });

    it('should be instanceof MemoryMcpError', () => {
      const error = new IndexError(ErrorCode.INDEX_BUILD_ERROR, 'Build failed');

      expect(error.name).toBe('IndexError');
      expect(error).toBeInstanceOf(MemoryMcpError);
    });
  });

  describe('McpProtocolError', () => {
    it('should create error with code and message', () => {
      const error = new McpProtocolError(
        ErrorCode.MCP_PROTOCOL_ERROR,
        'Protocol violation'
      );

      expect(error.name).toBe('McpProtocolError');
      expect(error.code).toBe(ErrorCode.MCP_PROTOCOL_ERROR);
      expect(error.message).toBe('Protocol violation');
    });

    it('should include metadata', () => {
      const error = new McpProtocolError(
        ErrorCode.MCP_TOOL_ERROR,
        'Tool execution failed',
        { toolName: 'write_note', args: { title: 'test' } }
      );

      expect(error.metadata?.toolName).toBe('write_note');
    });

    it('should handle invalid request error', () => {
      const error = new McpProtocolError(
        ErrorCode.MCP_INVALID_REQUEST,
        'Invalid request format'
      );

      expect(error.code).toBe(ErrorCode.MCP_INVALID_REQUEST);
    });

    it('should be instanceof MemoryMcpError', () => {
      const error = new McpProtocolError(ErrorCode.MCP_PROTOCOL_ERROR, 'Error');

      expect(error.name).toBe('McpProtocolError');
      expect(error).toBeInstanceOf(MemoryMcpError);
    });
  });

  describe('에러 헬퍼 함수', () => {
    describe('createFileNotFoundError', () => {
      it('should create file not found error', () => {
        const error = createFileNotFoundError('/vault/note.md');

        expect(error).toBeInstanceOf(MemoryMcpError);
        expect(error.name).toBe('FileSystemError');
        expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(error.message).toContain('/vault/note.md');
        expect(error.metadata?.filePath).toBe('/vault/note.md');
      });

      it('should create descriptive Korean message', () => {
        const error = createFileNotFoundError('/test.txt');

        expect(error.message).toContain('파일을 찾을 수 없습니다');
      });
    });

    describe('createValidationError', () => {
      it('should create validation error for field', () => {
        const error = createValidationError('email', 'invalid@');

        expect(error).toBeInstanceOf(MemoryMcpError);
        expect(error.name).toBe('ValidationError');
        expect(error.message).toContain('email');
        expect(error.message).toContain('invalid@');
      });

      it('should handle different field types', () => {
        const error = createValidationError('id', 123);

        expect(error.message).toContain('id');
        expect(error.message).toContain('123');
      });

      it('should create descriptive Korean message', () => {
        const error = createValidationError('title', '');

        expect(error.message).toContain('유효하지 않은');
      });
    });

    describe('createIndexError', () => {
      it('should create index error with operation', () => {
        const error = createIndexError('rebuild');

        expect(error).toBeInstanceOf(MemoryMcpError);
        expect(error.name).toBe('IndexError');
        expect(error.code).toBe(ErrorCode.INDEX_BUILD_ERROR);
        expect(error.message).toContain('rebuild');
        expect(error.metadata?.operation).toBe('rebuild');
      });

      it('should include details when provided', () => {
        const error = createIndexError('update', 'disk full');

        expect(error.message).toContain('update');
        expect(error.message).toContain('disk full');
        expect(error.metadata?.details).toBe('disk full');
      });

      it('should handle missing details', () => {
        const error = createIndexError('create');

        expect(error.metadata?.details).toBeUndefined();
        expect(error.message).toBe('인덱스 create 실패');
      });

      it('should create descriptive Korean message', () => {
        const error = createIndexError('빌드', '권한 오류');

        expect(error.message).toContain('인덱스');
        expect(error.message).toContain('실패');
      });
    });
  });

  describe('에러 체인', () => {
    it('should preserve error inheritance chain', () => {
      const fileError = new FileSystemError(
        ErrorCode.FILE_NOT_FOUND,
        'Not found',
        '/test.md'
      );
      const validationError = new ValidationError('Invalid');
      const indexError = new IndexError(ErrorCode.INDEX_BUILD_ERROR, 'Failed');

      // All should be instances of Error
      expect(fileError).toBeInstanceOf(Error);
      expect(validationError).toBeInstanceOf(Error);
      expect(indexError).toBeInstanceOf(Error);

      // All should have stack traces
      expect(fileError.stack).toBeDefined();
      expect(validationError.stack).toBeDefined();
      expect(indexError.stack).toBeDefined();
    });
  });
});
