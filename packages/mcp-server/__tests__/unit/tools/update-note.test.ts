/**
 * update_note 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { UpdateNoteInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import { ErrorCode } from '@inchankang/zettel-memory-common';

describe('update_note tool', () => {
  let context: ToolExecutionContext;
  let createdNoteUid: string;

  beforeEach(async () => {
    context = createTestContext();

    // 테스트용 노트 생성
    const createResult = await executeTool(
      'create_note',
      {
        title: 'Original Title',
        content: 'Original content',
        category: 'Resources',
        tags: ['original'],
      },
      context
    );

    createdNoteUid = createResult._meta?.metadata?.id;
    expect(createdNoteUid).toBeDefined();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('Schema Validation', () => {
    it('유효한 업데이트 입력을 검증해야 함', () => {
      const validInput = {
        uid: '20250927T103000123456Z',
        title: 'Updated Title',
      };

      const result = UpdateNoteInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('UID가 없으면 실패해야 함', () => {
      const invalidInput = {
        title: 'Updated Title',
      };

      const result = UpdateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('업데이트할 필드가 없으면 실패해야 함', () => {
      const invalidInput = {
        uid: '20250927T103000123456Z',
      };

      const result = UpdateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('최소 하나');
      }
    });

    it('제목만 업데이트할 수 있어야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        title: 'New Title',
      };

      const result = UpdateNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('내용만 업데이트할 수 있어야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        content: 'New content',
      };

      const result = UpdateNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('여러 필드를 동시에 업데이트할 수 있어야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        title: 'New Title',
        content: 'New content',
        category: 'Projects' as const,
        tags: ['updated', 'test'],
      };

      const result = UpdateNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('project를 null로 설정할 수 있어야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        project: null,
      };

      const result = UpdateNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('노트 제목을 성공적으로 업데이트해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        title: 'Updated Title',
      };

      const result = await executeTool('update_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('업데이트');
      expect(result.isError).toBeUndefined();

      // 노트를 읽어서 확인
      const readResult = await executeTool(
        'read_note',
        { uid: createdNoteUid },
        context
      );
      expect(readResult.content[0]?.text).toContain('Updated Title');
    });

    it('노트 내용을 성공적으로 업데이트해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        content: '# New Content\n\nThis is updated.',
      };

      const result = await executeTool('update_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();

      // 노트를 읽어서 확인
      const readResult = await executeTool(
        'read_note',
        { uid: createdNoteUid },
        context
      );
      expect(readResult.content[0]?.text).toContain('New Content');
    });

    it('노트 카테고리를 업데이트해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        category: 'Projects' as const,
      };

      const result = await executeTool('update_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('노트 태그를 업데이트해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        tags: ['updated', 'new-tag'],
      };

      const result = await executeTool('update_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('여러 필드를 동시에 업데이트해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        title: 'Completely Updated',
        content: 'All fields updated',
        category: 'Archives' as const,
        tags: ['multi-update'],
      };

      const result = await executeTool('update_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();

      // 노트를 읽어서 모든 변경사항 확인
      const readResult = await executeTool(
        'read_note',
        { uid: createdNoteUid },
        context
      );
      expect(readResult.content[0]?.text).toContain('Completely Updated');
      expect(readResult.content[0]?.text).toContain('All fields updated');
    });
  });

  describe('Error Handling', () => {
    it('존재하지 않는 UID에 대해 에러를 반환해야 함', async () => {
      const input = {
        uid: '99999999T999999999999Z',
        title: 'Updated',
      };

      await expect(
        executeTool('update_note', input, context)
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('업데이트할 필드가 없으면 에러를 반환해야 함', async () => {
      const invalidInput = {
        uid: createdNoteUid,
      };

      await expect(
        executeTool('update_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 카테고리에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        uid: createdNoteUid,
        category: 'InvalidCategory',
      };

      await expect(
        executeTool('update_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });
  });
});
