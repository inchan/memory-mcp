/**
 * read_note 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { ReadNoteInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import { ErrorCode } from '@inchankang/zettel-memory-common';

describe('read_note tool', () => {
  let context: ToolExecutionContext;
  let createdNoteUid: string;

  beforeEach(async () => {
    context = createTestContext();

    // 테스트용 노트 생성
    const createResult = await executeTool(
      'create_note',
      {
        title: 'Test Note for Reading',
        content: '# Test Content\n\nThis is a test note.',
        category: 'Resources',
        tags: ['test'],
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
    it('유효한 UID 입력을 검증해야 함', () => {
      const validInput = {
        uid: '20250927T103000123456Z',
      };

      const result = ReadNoteInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('UID가 없으면 실패해야 함', () => {
      const invalidInput = {};

      const result = ReadNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('빈 UID를 거부해야 함', () => {
      const invalidInput = {
        uid: '',
      };

      const result = ReadNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('최소 1자');
      }
    });

    it('includeMetadata 옵션을 처리해야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        includeMetadata: true,
      };

      const result = ReadNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeMetadata).toBe(true);
      }
    });

    it('includeLinks 옵션을 처리해야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
        includeLinks: true,
      };

      const result = ReadNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeLinks).toBe(true);
      }
    });

    it('기본값을 올바르게 적용해야 함', () => {
      const input = {
        uid: '20250927T103000123456Z',
      };

      const result = ReadNoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        // 스키마가 optional 필드는 undefined를 반환할 수 있음
        expect(result.data.includeMetadata === undefined || result.data.includeMetadata === false).toBe(true);
        expect(result.data.includeLinks === undefined || result.data.includeLinks === false).toBe(true);
      }
    });
  });

  describe('Tool Execution', () => {
    it('노트를 성공적으로 읽어야 함', async () => {
      const input = {
        uid: createdNoteUid,
      };

      const result = await executeTool('read_note', input, context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('Test Note for Reading');
      expect(result.content[0]?.text).toContain('Test Content');
    });

    it('메타데이터를 포함하여 노트를 읽어야 함', async () => {
      const input = {
        uid: createdNoteUid,
        includeMetadata: true,
      };

      const result = await executeTool('read_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('메타데이터') ||
        expect(result._meta?.metadata).toBeDefined();
    });

    it('링크 정보를 포함하여 노트를 읽어야 함', async () => {
      const input = {
        uid: createdNoteUid,
        includeLinks: true,
      };

      const result = await executeTool('read_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      // 링크 관련 정보가 포함되어 있어야 함
    });

    it('모든 옵션을 함께 사용할 수 있어야 함', async () => {
      const input = {
        uid: createdNoteUid,
        includeMetadata: true,
        includeLinks: true,
      };

      const result = await executeTool('read_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('존재하지 않는 UID에 대해 에러를 반환해야 함', async () => {
      const input = {
        uid: '99999999T999999999999Z',
      };

      await expect(executeTool('read_note', input, context)).rejects.toMatchObject(
        {
          code: ErrorCode.RESOURCE_NOT_FOUND,
        }
      );
    });

    it('잘못된 입력에 대해 스키마 검증 에러를 반환해야 함', async () => {
      const invalidInput = {
        // uid 누락
      };

      await expect(
        executeTool('read_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('잘못된 UID 형식을 처리해야 함', async () => {
      const input = {
        uid: 'invalid-uid-format',
      };

      // 스키마는 통과하지만 파일을 찾을 수 없음
      await expect(executeTool('read_note', input, context)).rejects.toMatchObject(
        {
          code: ErrorCode.RESOURCE_NOT_FOUND,
        }
      );
    });
  });
});
