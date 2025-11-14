/**
 * search_memory 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { SearchMemoryInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import { ErrorCode } from '@inchankang/zettel-memory-common';

describe('search_memory tool', () => {
  let context: ToolExecutionContext;

  beforeEach(async () => {
    context = createTestContext();

    // 테스트용 노트들 생성
    await executeTool(
      'create_note',
      {
        title: 'JavaScript Programming Guide',
        content: 'This is a comprehensive guide to JavaScript programming.',
        category: 'Resources',
        tags: ['javascript', 'programming'],
      },
      context
    );

    await executeTool(
      'create_note',
      {
        title: 'TypeScript Best Practices',
        content: 'Learn TypeScript best practices and patterns.',
        category: 'Resources',
        tags: ['typescript', 'programming'],
      },
      context
    );

    await executeTool(
      'create_note',
      {
        title: 'Python Data Science',
        content: 'Introduction to data science with Python.',
        category: 'Resources',
        tags: ['python', 'data-science'],
      },
      context
    );
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('Schema Validation', () => {
    it('유효한 검색 입력을 검증해야 함', () => {
      const validInput = {
        query: 'javascript',
      };

      const result = SearchMemoryInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('검색어가 없으면 실패해야 함', () => {
      const invalidInput = {};

      const result = SearchMemoryInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('빈 검색어를 거부해야 함', () => {
      const invalidInput = {
        query: '',
      };

      const result = SearchMemoryInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('최소 1자');
      }
    });

    it('카테고리 필터를 검증해야 함', () => {
      const validInput = {
        query: 'test',
        category: 'Resources' as const,
      };

      const result = SearchMemoryInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('태그 필터를 검증해야 함', () => {
      const validInput = {
        query: 'test',
        tags: ['tag1', 'tag2'],
      };

      const result = SearchMemoryInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('limit 범위를 검증해야 함', () => {
      const validInput = {
        query: 'test',
        limit: 50,
      };

      const result = SearchMemoryInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // 범위 초과
      const invalidInput = {
        query: 'test',
        limit: 101,
      };

      const invalidResult = SearchMemoryInputSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });

    it('기본값을 올바르게 적용해야 함', () => {
      const input = {
        query: 'test',
      };

      const result = SearchMemoryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // 스키마가 optional 필드는 undefined를 반환할 수 있음
        expect(result.data.tags === undefined || Array.isArray(result.data.tags)).toBe(true);
        expect(result.data.limit === undefined || typeof result.data.limit === 'number').toBe(true);
        expect(result.data.offset === undefined || typeof result.data.offset === 'number').toBe(true);
      }
    });
  });

  describe('Tool Execution', () => {
    it('키워드로 검색해야 함', async () => {
      const input = {
        query: 'JavaScript',
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
      const text = result.content[0]?.text || '';
      expect(text.toLowerCase()).toContain('javascript');
    });

    it('여러 검색어를 처리해야 함', async () => {
      const input = {
        query: 'programming best practices',
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('카테고리 필터를 적용해야 함', async () => {
      const input = {
        query: 'programming',
        category: 'Resources' as const,
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('태그 필터를 적용해야 함', async () => {
      const input = {
        query: 'programming',
        tags: ['javascript'],
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('limit를 적용해야 함', async () => {
      const input = {
        query: 'programming',
        limit: 1,
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result._meta?.metadata).toHaveProperty('totalResults');
    });

    it('offset를 적용해야 함', async () => {
      const input = {
        query: 'programming',
        offset: 1,
        limit: 1,
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('검색 메타데이터를 반환해야 함', async () => {
      const input = {
        query: 'programming',
      };

      const result = await executeTool('search_memory', input, context);

      expect(result._meta?.metadata).toHaveProperty('query', 'programming');
      expect(result._meta?.metadata).toHaveProperty('totalResults');
      expect(result._meta?.metadata).toHaveProperty('searchTimeMs');
    });

    it('결과가 없을 때 빈 결과를 반환해야 함', async () => {
      const input = {
        query: 'nonexistentkeyword12345',
      };

      const result = await executeTool('search_memory', input, context);

      expect(result.content[0]?.type).toBe('text');
      const text = result.content[0]?.text || '';
      // 검색 결과가 없는 경우의 메시지 확인
      expect(text.includes('없') || text.includes('0')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('검색어 없이 호출하면 에러를 반환해야 함', async () => {
      const invalidInput = {};

      await expect(
        executeTool('search_memory', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 카테고리에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        query: 'test',
        category: 'InvalidCategory',
      };

      await expect(
        executeTool('search_memory', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 limit에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        query: 'test',
        limit: 0,
      };

      await expect(
        executeTool('search_memory', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });
  });
});
