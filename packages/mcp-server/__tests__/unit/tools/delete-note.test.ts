/**
 * delete_note 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { DeleteNoteInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import { ErrorCode } from '@inchankang/zettel-memory-common';

describe('delete_note tool', () => {
  let context: ToolExecutionContext;
  let createdNoteUid: string;

  beforeEach(async () => {
    context = createTestContext();

    // 테스트용 노트 생성
    const createResult = await executeTool(
      'create_note',
      {
        title: 'Note to Delete',
        content: 'This note will be deleted',
        category: 'Resources',
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
    it('유효한 삭제 입력을 검증해야 함', () => {
      const validInput = {
        uid: '20250927T103000123456Z',
        confirm: true,
      };

      const result = DeleteNoteInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('UID가 없으면 실패해야 함', () => {
      const invalidInput = {
        confirm: true,
      };

      const result = DeleteNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('confirm이 없으면 실패해야 함', () => {
      const invalidInput = {
        uid: '20250927T103000123456Z',
      };

      const result = DeleteNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('confirm이 false이면 실패해야 함', () => {
      const invalidInput = {
        uid: '20250927T103000123456Z',
        confirm: false,
      };

      const result = DeleteNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('true');
      }
    });

    it('빈 UID를 거부해야 함', () => {
      const invalidInput = {
        uid: '',
        confirm: true,
      };

      const result = DeleteNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('노트를 성공적으로 삭제해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        confirm: true,
      };

      const result = await executeTool('delete_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('삭제');
      expect(result.isError).toBeUndefined();

      // 노트가 더 이상 존재하지 않는지 확인
      await expect(
        executeTool('read_note', { uid: createdNoteUid }, context)
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('삭제 후 메타데이터를 반환해야 함', async () => {
      const input = {
        uid: createdNoteUid,
        confirm: true,
      };

      const result = await executeTool('delete_note', input, context);

      expect(result._meta?.metadata).toHaveProperty('uid', createdNoteUid);
    });
  });

  describe('Error Handling', () => {
    it('존재하지 않는 UID에 대해 에러를 반환해야 함', async () => {
      const input = {
        uid: '99999999T999999999999Z',
        confirm: true,
      };

      await expect(
        executeTool('delete_note', input, context)
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('confirm이 없으면 에러를 반환해야 함', async () => {
      const invalidInput = {
        uid: createdNoteUid,
        confirm: false,
      };

      await expect(
        executeTool('delete_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 입력에 대해 스키마 검증 에러를 반환해야 함', async () => {
      const invalidInput = {
        uid: createdNoteUid,
        // confirm 누락
      };

      await expect(
        executeTool('delete_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('동일한 노트를 두 번 삭제하려 하면 에러를 반환해야 함', async () => {
      // 첫 번째 삭제
      await executeTool(
        'delete_note',
        { uid: createdNoteUid, confirm: true },
        context
      );

      // 두 번째 삭제 시도
      await expect(
        executeTool('delete_note', { uid: createdNoteUid, confirm: true }, context)
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });
});
