/**
 * Errors 모듈 상세 테스트
 */

import {
  ErrorCode,
  MemoryMcpError,
  FileSystemError,
  ValidationError,
  ProtocolError,
  createErrorFromCode,
  isMemoryMcpError,
  formatError,
} from '../src/errors';

describe('Error System', () => {
  describe('ErrorCode enum', () => {
    test('모든 에러 코드가 정의됨', () => {
      expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCode.INVALID_FRONT_MATTER).toBe('INVALID_FRONT_MATTER');
      expect(ErrorCode.MCP_PROTOCOL_ERROR).toBe('MCP_PROTOCOL_ERROR');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    test('에러 코드가 문자열 타입', () => {
      Object.values(ErrorCode).forEach(code => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('MemoryMcpError', () => {
    test('기본 에러 생성', () => {
      const error = new MemoryMcpError(
        ErrorCode.FILE_NOT_FOUND,
        '파일을 찾을 수 없습니다'
      );

      expect(error.name).toBe('MemoryMcpError');
      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.message).toBe('파일을 찾을 수 없습니다');
      expect(error.metadata).toBeUndefined();
    });

    test('메타데이터와 함께 에러 생성', () => {
      const metadata = { filePath: '/test/path.md', attempted: true };
      const error = new MemoryMcpError(
        ErrorCode.FILE_READ_ERROR,
        '파일 읽기 실패',
        metadata
      );

      expect(error.code).toBe(ErrorCode.FILE_READ_ERROR);
      expect(error.metadata).toEqual(metadata);
    });

    test('에러 JSON 직렬화', () => {
      const error = new MemoryMcpError(
        ErrorCode.SCHEMA_VALIDATION_ERROR,
        '스키마 검증 실패',
        { field: 'title', value: null }
      );

      const json = error.toJSON();

      expect(json.name).toBe('MemoryMcpError');
      expect(json.code).toBe(ErrorCode.SCHEMA_VALIDATION_ERROR);
      expect(json.message).toBe('스키마 검증 실패');
      expect(json.metadata).toEqual({ field: 'title', value: null });
      expect(json.stack).toBeDefined();
    });

    test('에러 문자열 변환', () => {
      const error = new MemoryMcpError(
        ErrorCode.TIMEOUT_ERROR,
        '요청 시간 초과'
      );

      const str = error.toString();
      expect(str).toContain('MemoryMcpError');
      expect(str).toContain('TIMEOUT_ERROR');
      expect(str).toContain('요청 시간 초과');
    });

    test('스택 트레이스 포함', () => {
      const error = new MemoryMcpError(ErrorCode.INTERNAL_ERROR, '내부 오류');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('MemoryMcpError');
    });
  });

  describe('FileSystemError', () => {
    test('파일 시스템 에러 생성', () => {
      const error = new FileSystemError(
        '파일을 읽을 수 없습니다',
        '/path/to/file.md'
      );

      expect(error.name).toBe('FileSystemError');
      expect(error.code).toBe(ErrorCode.FILE_READ_ERROR);
      expect(error.filePath).toBe('/path/to/file.md');
    });

    test('사용자 정의 에러 코드', () => {
      const error = new FileSystemError(
        '파일을 쓸 수 없습니다',
        '/path/to/file.md',
        ErrorCode.FILE_WRITE_ERROR
      );

      expect(error.code).toBe(ErrorCode.FILE_WRITE_ERROR);
    });
  });

  describe('ValidationError', () => {
    test('검증 에러 생성', () => {
      const error = new ValidationError(
        '잘못된 UID 형식입니다',
        'id',
        'invalid-uid'
      );

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCode.SCHEMA_VALIDATION_ERROR);
      expect(error.field).toBe('id');
      expect(error.value).toBe('invalid-uid');
    });

    test('검증 에러 메타데이터', () => {
      const error = new ValidationError(
        '필수 필드가 누락되었습니다',
        'title',
        undefined
      );

      expect(error.metadata).toEqual({
        field: 'title',
        value: undefined,
      });
    });
  });

  describe('ProtocolError', () => {
    test('프로토콜 에러 생성', () => {
      const error = new ProtocolError(
        '잘못된 MCP 요청입니다',
        'invalid_request'
      );

      expect(error.name).toBe('ProtocolError');
      expect(error.code).toBe(ErrorCode.MCP_PROTOCOL_ERROR);
      expect(error.protocolCode).toBe('invalid_request');
    });
  });

  describe('createErrorFromCode', () => {
    test('에러 코드로 적절한 에러 생성', () => {
      const fileError = createErrorFromCode(
        ErrorCode.FILE_NOT_FOUND,
        '파일 없음',
        { filePath: '/test.md' }
      );

      expect(fileError).toBeInstanceOf(FileSystemError);
      expect(fileError.code).toBe(ErrorCode.FILE_NOT_FOUND);
    });

    test('일반 에러 코드는 MemoryMcpError 생성', () => {
      const error = createErrorFromCode(
        ErrorCode.INTERNAL_ERROR,
        '내부 오류'
      );

      expect(error).toBeInstanceOf(MemoryMcpError);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    test('검증 관련 에러는 ValidationError 생성', () => {
      const error = createErrorFromCode(
        ErrorCode.INVALID_FRONT_MATTER,
        '잘못된 Front Matter',
        { field: 'category' }
      );

      expect(error).toBeInstanceOf(ValidationError);
    });

    test('프로토콜 관련 에러는 ProtocolError 생성', () => {
      const error = createErrorFromCode(
        ErrorCode.MCP_INVALID_REQUEST,
        '잘못된 요청'
      );

      expect(error).toBeInstanceOf(ProtocolError);
    });
  });

  describe('isMemoryMcpError', () => {
    test('MemoryMcpError 인스턴스 확인', () => {
      const error = new MemoryMcpError(ErrorCode.INTERNAL_ERROR, '테스트');
      expect(isMemoryMcpError(error)).toBe(true);
    });

    test('파생 에러 클래스도 확인', () => {
      const fileError = new FileSystemError('파일 오류', '/test.md');
      const validationError = new ValidationError('검증 오류', 'field', 'value');
      
      expect(isMemoryMcpError(fileError)).toBe(true);
      expect(isMemoryMcpError(validationError)).toBe(true);
    });

    test('일반 Error는 false', () => {
      const error = new Error('일반 오류');
      expect(isMemoryMcpError(error)).toBe(false);
    });

    test('null/undefined는 false', () => {
      expect(isMemoryMcpError(null)).toBe(false);
      expect(isMemoryMcpError(undefined)).toBe(false);
    });
  });

  describe('formatError', () => {
    test('MemoryMcpError 포맷팅', () => {
      const error = new MemoryMcpError(
        ErrorCode.FILE_NOT_FOUND,
        '파일 없음',
        { filePath: '/test.md' }
      );

      const formatted = formatError(error);
      expect(formatted).toContain('FILE_NOT_FOUND');
      expect(formatted).toContain('파일 없음');
      expect(formatted).toContain('/test.md');
    });

    test('일반 Error 포맷팅', () => {
      const error = new Error('일반 오류');
      const formatted = formatError(error);
      
      expect(formatted).toContain('Error');
      expect(formatted).toContain('일반 오류');
    });

    test('문자열 에러 처리', () => {
      const formatted = formatError('문자열 오류');
      expect(formatted).toBe('문자열 오류');
    });

    test('알 수 없는 에러 처리', () => {
      const formatted = formatError({ unknown: 'error' });
      expect(formatted).toContain('알 수 없는 오류');
    });
  });

  describe('에러 체인 테스트', () => {
    test('원인 에러와 함께 에러 생성', () => {
      const originalError = new Error('원본 오류');
      const wrappedError = new MemoryMcpError(
        ErrorCode.FILE_READ_ERROR,
        '파일 읽기 실패',
        { cause: originalError }
      );

      expect(wrappedError.metadata?.cause).toBe(originalError);
    });

    test('중첩된 에러 처리', () => {
      const level1 = new Error('Level 1');
      const level2 = new MemoryMcpError(
        ErrorCode.INTERNAL_ERROR,
        'Level 2',
        { cause: level1 }
      );
      const level3 = new FileSystemError(
        'Level 3',
        '/file.md',
        ErrorCode.FILE_READ_ERROR,
        { cause: level2 }
      );

      expect(level3.metadata?.cause).toBe(level2);
      expect((level2.metadata?.cause as Error).message).toBe('Level 1');
    });
  });
});