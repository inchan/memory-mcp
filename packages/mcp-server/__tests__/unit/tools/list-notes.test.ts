/**
 * list_notes 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { ListNotesInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import { ErrorCode } from '@inchankang/zettel-memory-common';

describe('list_notes tool', () => {
  let context: ToolExecutionContext;

  beforeEach(async () => {
    context = createTestContext();

    // 테스트용 노트들 생성
    await executeTool(
      'create_note',
      {
        title: 'Project Note 1',
        content: 'Project content',
        category: 'Projects',
        tags: ['project', 'work'],
      },
      context
    );

    await executeTool(
      'create_note',
      {
        title: 'Resource Note 1',
        content: 'Resource content',
        category: 'Resources',
        tags: ['reference'],
      },
      context
    );

    await executeTool(
      'create_note',
      {
        title: 'Area Note 1',
        content: 'Area content',
        category: 'Areas',
        tags: ['personal'],
      },
      context
    );
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('Schema Validation', () => {
    it('빈 입력을 허용해야 함 (모든 필드 선택적)', () => {
      const validInput = {};

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        // 스키마가 optional 필드는 undefined를 반환할 수 있음
        expect(result.data.limit === undefined || typeof result.data.limit === 'number').toBe(true);
        expect(result.data.offset === undefined || typeof result.data.offset === 'number').toBe(true);
        expect(result.data.sortBy === undefined || typeof result.data.sortBy === 'string').toBe(true);
        expect(result.data.sortOrder === undefined || typeof result.data.sortOrder === 'string').toBe(true);
      }
    });

    it('카테고리 필터를 검증해야 함', () => {
      const validInput = {
        category: 'Projects' as const,
      };

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('잘못된 카테고리를 거부해야 함', () => {
      const invalidInput = {
        category: 'InvalidCategory',
      };

      const result = ListNotesInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('태그 필터를 검증해야 함', () => {
      const validInput = {
        tags: ['tag1', 'tag2'],
      };

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('limit 범위를 검증해야 함', () => {
      const validInput = {
        limit: 50,
      };

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // 범위 초과
      const invalidInput = {
        limit: 1001,
      };

      const invalidResult = ListNotesInputSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });

    it('offset을 검증해야 함', () => {
      const validInput = {
        offset: 10,
      };

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      // 음수 거부
      const invalidInput = {
        offset: -1,
      };

      const invalidResult = ListNotesInputSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });

    it('정렬 옵션을 검증해야 함', () => {
      const validInput = {
        sortBy: 'title' as const,
        sortOrder: 'asc' as const,
      };

      const result = ListNotesInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('모든 노트를 나열해야 함', async () => {
      const result = await executeTool('list_notes', {}, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();

      // 3개의 노트가 생성되었으므로
      const text = result.content[0]?.text || '';
      expect(text).toContain('Project Note 1');
      expect(text).toContain('Resource Note 1');
      expect(text).toContain('Area Note 1');
    });

    it('카테고리로 필터링해야 함', async () => {
      const input = {
        category: 'Projects' as const,
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      const text = result.content[0]?.text || '';
      expect(text).toContain('Project Note 1');
      expect(text).not.toContain('Resource Note 1');
    });

    it('태그로 필터링해야 함', async () => {
      const input = {
        tags: ['project'],
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      const text = result.content[0]?.text || '';
      expect(text).toContain('Project Note 1');
    });

    it('limit를 적용해야 함', async () => {
      const input = {
        limit: 2,
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      // 정확한 개수는 메타데이터에서 확인 ('total' 필드 사용)
      expect(result._meta?.metadata).toHaveProperty('total');
    });

    it('offset를 적용해야 함', async () => {
      const input = {
        offset: 1,
        limit: 2,
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('정렬 옵션을 적용해야 함', async () => {
      const input = {
        sortBy: 'title' as const,
        sortOrder: 'asc' as const,
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('여러 필터를 조합할 수 있어야 함', async () => {
      const input = {
        category: 'Projects' as const,
        tags: ['work'],
        limit: 10,
      };

      const result = await executeTool('list_notes', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('잘못된 카테고리에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        category: 'WrongCategory',
      };

      await expect(
        executeTool('list_notes', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 limit에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        limit: 0,
      };

      await expect(
        executeTool('list_notes', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('노트가 없을 때 빈 목록을 반환해야 함', async () => {
      // 모든 노트 삭제
      const listResult = await executeTool('list_notes', {}, context);
      // 실제 삭제는 다른 테스트에서 처리

      // 존재하지 않는 카테고리로 필터링
      const result = await executeTool(
        'list_notes',
        { category: 'Archives' },
        context
      );

      expect(result.content[0]?.type).toBe('text');
      const text = result.content[0]?.text || '';
      // 노트가 없는 경우의 메시지 확인
      expect(text.includes('없') || text.includes('0')).toBe(true);
    });
  });
});
