/**
 * Tools Registry 확장 테스트
 * 기존 테스트에서 커버되지 않은 엣지 케이스 및 에러 처리 테스트
 */

import { ErrorCode, MemoryMcpError } from '@memory-mcp/common';
import { jest } from '@jest/globals';
import {
  executeTool,
  listTools,
  ToolExecutionContext,
} from '../index.js';
import {
  resetToolRegistryForTests,
  setSearchEngineFactoryForTests,
  getCachedSearchEnginePathsForTests,
  resolveIndexPathForTests,
  getSearchEngineForTests,
} from '../registry.js';
import type {
  EnhancedSearchResult,
  IndexSearchEngine,
  SearchOptions,
} from '@memory-mcp/index-search';
import * as path from 'path';

// 실패하는 검색 엔진 스텁
class FailingSearchEngine implements IndexSearchEngine {
  indexNote = jest.fn().mockRejectedValue(new Error('Index failed'));
  removeNote = jest.fn().mockRejectedValue(new Error('Remove failed'));
  batchIndexNotes = jest.fn().mockRejectedValue(new Error('Batch failed'));
  getOrphanNotes = jest.fn().mockRejectedValue(new Error('Orphan failed'));
  getBacklinks = jest.fn().mockRejectedValue(new Error('Backlinks failed'));
  getOutgoingLinks = jest.fn().mockRejectedValue(new Error('Outgoing failed'));
  getConnectedNodes = jest.fn().mockRejectedValue(new Error('Connected failed'));
  getIndexStats = jest.fn().mockRejectedValue(new Error('Stats failed'));
  optimize = jest.fn().mockRejectedValue(new Error('Optimize failed'));
  close = jest.fn().mockRejectedValue(new Error('Close failed'));

  async search(query: string, options: SearchOptions = {}): Promise<EnhancedSearchResult> {
    throw new Error('Search failed');
  }
}

// 빈 결과를 반환하는 검색 엔진 스텁
class EmptySearchEngine implements IndexSearchEngine {
  indexNote = jest.fn().mockResolvedValue(undefined);
  removeNote = jest.fn().mockResolvedValue(undefined);
  batchIndexNotes = jest.fn().mockResolvedValue({ successful: 0, failed: 0, totalTimeMs: 0, failures: [] });
  getOrphanNotes = jest.fn().mockResolvedValue([]);
  getBacklinks = jest.fn().mockResolvedValue([]);
  getOutgoingLinks = jest.fn().mockResolvedValue([]);
  getConnectedNodes = jest.fn().mockResolvedValue([]);
  getIndexStats = jest.fn().mockResolvedValue({
    totalNotes: 0,
    totalLinks: 0,
    lastIndexedAt: new Date().toISOString(),
    indexSizeBytes: 0,
  });
  optimize = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);

  async search(query: string, options: SearchOptions = {}): Promise<EnhancedSearchResult> {
    return {
      results: [],
      metrics: {
        queryTimeMs: 1,
        processingTimeMs: 1,
        totalTimeMs: 2,
        totalResults: 0,
        returnedResults: 0,
        cacheHit: false,
      },
      totalCount: 0,
    };
  }
}

function createTestContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    vaultPath: '/test/vault',
    indexPath: '/test/index.db',
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLevel: jest.fn(),
    },
    policy: {
      maxRetries: 1,
      timeoutMs: 1000,
    },
    mode: 'dev',
    ...overrides,
  };
}

describe('Registry Extended Tests', () => {
  beforeEach(() => {
    resetToolRegistryForTests();
  });

  afterEach(() => {
    resetToolRegistryForTests();
  });

  describe('Index Path Resolution', () => {
    it('절대 경로 그대로 반환', () => {
      const context = createTestContext({
        indexPath: '/absolute/path/index.db',
      });

      const resolved = resolveIndexPathForTests(context);
      expect(resolved).toBe('/absolute/path/index.db');
    });

    it('상대 경로를 볼트 경로 기준으로 해석', () => {
      const context = createTestContext({
        vaultPath: '/vault/path',
        indexPath: 'relative/index.db',
      });

      const resolved = resolveIndexPathForTests(context);
      expect(resolved).toBe(path.resolve('/vault/path', 'relative/index.db'));
    });

    it('빈 인덱스 경로는 기본값 사용', () => {
      const context = createTestContext({
        vaultPath: '/vault/path',
        indexPath: '',
      });

      const resolved = resolveIndexPathForTests(context);
      expect(resolved).toBe(path.join('/vault/path', '.memory-index.db'));
    });

    it('공백만 있는 인덱스 경로는 기본값 사용', () => {
      const context = createTestContext({
        vaultPath: '/vault/path',
        indexPath: '   ',
      });

      const resolved = resolveIndexPathForTests(context);
      expect(resolved).toBe(path.join('/vault/path', '.memory-index.db'));
    });

    it('undefined 인덱스 경로는 기본값 사용', () => {
      const context = createTestContext({
        vaultPath: '/vault/path',
        indexPath: undefined as any,
      });

      const resolved = resolveIndexPathForTests(context);
      expect(resolved).toBe(path.join('/vault/path', '.memory-index.db'));
    });
  });

  describe('Search Engine Caching', () => {
    it('같은 인덱스 경로에 대해 캐시된 엔진 반환', () => {
      const mockEngine = new EmptySearchEngine();
      setSearchEngineFactoryForTests(() => mockEngine);

      const context = createTestContext({ indexPath: '/same/path.db' });

      const engine1 = getSearchEngineForTests(context);
      const engine2 = getSearchEngineForTests(context);

      expect(engine1).toBe(engine2);
      expect(getCachedSearchEnginePathsForTests()).toContain('/same/path.db');
    });

    it('다른 인덱스 경로에 대해 별도 엔진 생성', () => {
      let engineCount = 0;
      setSearchEngineFactoryForTests(() => {
        engineCount++;
        return new EmptySearchEngine();
      });

      const context1 = createTestContext({ indexPath: '/path1.db' });
      const context2 = createTestContext({ indexPath: '/path2.db' });

      getSearchEngineForTests(context1);
      getSearchEngineForTests(context2);

      expect(engineCount).toBe(2);
      expect(getCachedSearchEnginePathsForTests()).toContain('/path1.db');
      expect(getCachedSearchEnginePathsForTests()).toContain('/path2.db');
    });

    it('캐시 리셋 후 새 엔진 생성', () => {
      let engineCount = 0;
      setSearchEngineFactoryForTests(() => {
        engineCount++;
        return new EmptySearchEngine();
      });

      const context = createTestContext({ indexPath: '/test.db' });

      getSearchEngineForTests(context);
      expect(engineCount).toBe(1);

      resetToolRegistryForTests();
      setSearchEngineFactoryForTests(() => {
        engineCount++;
        return new EmptySearchEngine();
      });

      getSearchEngineForTests(context);
      expect(engineCount).toBe(2);
    });
  });

  describe('Tool Validation', () => {
    it('잘못된 툴 이름으로 실행 시 에러', async () => {
      const context = createTestContext();

      await expect(
        executeTool('invalid_tool' as any, {}, context)
      ).rejects.toMatchObject({
        code: ErrorCode.MCP_INVALID_REQUEST,
        message: expect.stringContaining('알 수 없는 MCP 툴입니다'),
      });
    });

    it('등록되지 않은 툴 이름으로 실행 시 에러', async () => {
      const context = createTestContext();

      // 임시로 툴맵에서 제거된 툴 이름으로 테스트
      await expect(
        executeTool('nonexistent_tool' as any, {}, context)
      ).rejects.toMatchObject({
        code: ErrorCode.MCP_INVALID_REQUEST,
        message: expect.stringContaining('알 수 없는 MCP 툴입니다'),
      });
    });

    it('스키마 검증 실패 시 적절한 에러 메시지', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      await expect(
        executeTool(
          'search_memory',
          { invalidField: 'value' }, // query 필드 누락
          context
        )
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
        message: expect.stringContaining('툴 입력이 유효하지 않습니다'),
      });
    });
  });

  describe('Search Memory Tool Edge Cases', () => {
    it('검색 결과가 없을 때 적절한 메시지', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      const result = await executeTool(
        'search_memory',
        { query: 'nonexistent' },
        context
      );

      expect(result.content[0]?.text).toContain('검색 결과가 없습니다');
      expect(result.content[0]?.text).toContain('nonexistent');
      expect(result._meta?.metadata).toMatchObject({
        resultsCount: 0,
        totalCount: 0,
      });
    });

    it('검색 엔진 실패 시 에러 처리', async () => {
      setSearchEngineFactoryForTests(() => new FailingSearchEngine());
      const context = createTestContext();

      await expect(
        executeTool(
          'search_memory',
          { query: 'test' },
          context
        )
      ).rejects.toMatchObject({
        code: ErrorCode.MCP_TOOL_ERROR,
        message: expect.stringContaining('검색에 실패했습니다'),
      });
    });

    it('태그 필터링 옵션', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      const result = await executeTool(
        'search_memory',
        {
          query: 'test',
          tags: ['tag1', 'tag2'],
          category: 'Projects',
          limit: 5
        },
        context
      );

      expect(result.content[0]?.text).toContain('tag1, tag2');
      expect(result.content[0]?.text).toContain('Projects');
    });

    it('빈 태그 배열 처리', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      const result = await executeTool(
        'search_memory',
        {
          query: 'test',
          tags: []
        },
        context
      );

      expect(result.content[0]?.text).toContain('(없음)');
    });
  });

  describe('Create Note Tool Edge Cases', () => {
    // 실제 파일 시스템 의존성 때문에 모킹 필요
    beforeEach(() => {
      // storage-md 모킹
      jest.doMock('@memory-mcp/storage-md', () => ({
        createNewNote: jest.fn().mockReturnValue({
          frontMatter: { id: 'test-note-id' },
          filePath: '/test/path/note.md',
          content: 'Test content',
        }),
        saveNote: jest.fn().mockResolvedValue(undefined),
      }));
    });

    it('특수문자가 포함된 제목 처리', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      const result = await executeTool(
        'create_note',
        {
          title: '특수!@#$문자%제목',
          content: 'Test content',
          category: 'Projects',
          tags: [],
        },
        context
      );

      expect(result._meta?.metadata).toMatchObject({
        id: 'test-note-id',
        title: '특수!@#$문자%제목',
      });
    });

    it('검색 인덱스 업데이트 실패 시 경고만 기록', async () => {
      setSearchEngineFactoryForTests(() => new FailingSearchEngine());
      const context = createTestContext();

      // 저장은 성공하지만 인덱스만 실패
      const result = await executeTool(
        'create_note',
        {
          title: 'Test Note',
          content: 'Test content',
          category: 'Projects',
          tags: [],
        },
        context
      );

      // 노트 생성은 성공해야 함
      expect(result.content[0]?.text).toContain('성공적으로 생성');

      // 경고 로그가 기록되었는지 확인
      expect(context.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[tool:create_note] 검색 인덱스 업데이트 실패'),
        expect.any(Object)
      );
    });
  });

  describe('Association Engine Integration', () => {
    it('세션 컨텍스트 없이 연관 추천', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      const result = await executeTool(
        'associate_memory',
        {
          sessionId: 'new-session',
          query: 'test query',
        },
        context
      );

      expect(result.content[0]?.text).toContain('연관 추천');
      expect(result._meta?.metadata).toHaveProperty('sessionId', 'new-session');
    });

    it('세션 컨텍스트 리셋', async () => {
      const context = createTestContext();

      const result = await executeTool(
        'session_context',
        {
          sessionId: 'test-session',
          operation: 'reset',
        },
        context
      );

      expect(result.content[0]?.text).toContain('초기화되었습니다');
      expect(result._meta?.metadata).toMatchObject({
        sessionId: 'test-session',
        operation: 'reset',
      });
    });

    it('존재하지 않는 세션 컨텍스트 조회', async () => {
      const context = createTestContext();

      const result = await executeTool(
        'session_context',
        {
          sessionId: 'nonexistent-session',
          operation: 'get',
        },
        context
      );

      expect(result.content[0]?.text).toContain('찾을 수 없습니다');
      expect(result._meta?.metadata).toMatchObject({
        context: null,
      });
    });

    it('존재하지 않는 세션 리플렉션', async () => {
      const context = createTestContext();

      await expect(
        executeTool(
          'reflect_session',
          {
            sessionId: 'nonexistent-session',
          },
          context
        )
      ).rejects.toMatchObject({
        code: ErrorCode.MCP_INVALID_REQUEST,
        message: expect.stringContaining('세션 컨텍스트가 존재하지 않습니다'),
      });
    });
  });

  describe('Tool Execution Policy', () => {
    it('정책 오버라이드 적용', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext({
        policy: {
          timeoutMs: 2000,
          maxRetries: 3,
        },
      });

      const result = await executeTool(
        'search_memory',
        { query: 'test' },
        context,
        { timeoutMs: 5000 } // 오버라이드
      );

      expect(result).toBeDefined();
    });

    it('재시도 로직 동작', async () => {
      let attemptCount = 0;
      setSearchEngineFactoryForTests(() => ({
        async search() {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('Temporary failure');
          }
          return {
            results: [],
            metrics: { queryTimeMs: 1, processingTimeMs: 1, totalTimeMs: 2, totalResults: 0, returnedResults: 0, cacheHit: false },
            totalCount: 0,
          };
        },
      } as any));

      const context = createTestContext({
        policy: {
          timeoutMs: 5000,
          maxRetries: 2,
        },
      });

      const result = await executeTool(
        'search_memory',
        { query: 'test' },
        context
      );

      expect(attemptCount).toBe(2);
      expect(result).toBeDefined();
      expect(context.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('1차 시도 실패'),
        expect.any(Object)
      );
    });
  });

  describe('Tool Metadata and Logging', () => {
    it('민감정보 마스킹', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      await executeTool(
        'search_memory',
        { query: 'my-email@example.com secret data' },
        context
      );

      // 로그에서 마스킹된 쿼리 확인
      expect(context.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[tool:search_memory] 검색 요청 수신'),
        expect.objectContaining({
          query: expect.stringContaining('***'),
        })
      );
    });

    it('실행 시간 측정 및 로깅', async () => {
      setSearchEngineFactoryForTests(() => new EmptySearchEngine());
      const context = createTestContext();

      await executeTool(
        'search_memory',
        { query: 'test' },
        context
      );

      expect(context.logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[tool:search_memory] 실행 시작'),
        expect.any(Object)
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[tool:search_memory\] 실행 완료 \(\d+ms\)/),
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );
    });

    it('실행 실패시 로깅', async () => {
      setSearchEngineFactoryForTests(() => new FailingSearchEngine());
      const context = createTestContext({
        policy: { maxRetries: 0, timeoutMs: 1000 },
      });

      await expect(
        executeTool(
          'search_memory',
          { query: 'test' },
          context
        )
      ).rejects.toThrow();

      expect(context.logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/\[tool:search_memory\] 실행 실패 \(\d+ms\)/),
        expect.objectContaining({
          duration: expect.any(Number),
          error: expect.stringContaining('Search failed'),
        })
      );
    });
  });
});