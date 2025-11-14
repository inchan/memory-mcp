/**
 * create_note 툴 유닛 테스트
 */

import { executeTool } from '../../../src/tools';
import { CreateNoteInputSchema } from '../../../src/tools/schemas';
import { createTestContext, cleanupTestContext } from '../../test-helpers';
import type { ToolExecutionContext } from '../../../src/tools/types';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorCode } from '@memory-mcp/common';

describe('create_note tool', () => {
  let context: ToolExecutionContext;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('Schema Validation', () => {
    it('유효한 입력을 검증해야 함', () => {
      const validInput = {
        title: 'Test Note',
        content: 'This is test content',
        category: 'Resources' as const,
        tags: ['test', 'unit'],
      };

      const result = CreateNoteInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('제목이 없으면 실패해야 함', () => {
      const invalidInput = {
        content: 'Content without title',
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('내용이 없으면 실패해야 함', () => {
      const invalidInput = {
        title: 'Title without content',
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('필수');
      }
    });

    it('빈 제목을 거부해야 함', () => {
      const invalidInput = {
        title: '',
        content: 'Content',
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('최소 1자');
      }
    });

    it('빈 내용을 거부해야 함', () => {
      const invalidInput = {
        title: 'Title',
        content: '',
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('최소 1자');
      }
    });

    it('잘못된 카테고리를 거부해야 함', () => {
      const invalidInput = {
        title: 'Test',
        content: 'Content',
        category: 'InvalidCategory',
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('기본값을 올바르게 적용해야 함', () => {
      const minimalInput = {
        title: 'Test',
        content: 'Content',
      };

      const result = CreateNoteInputSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
      if (result.success) {
        // v2: category is now optional (no default)
        expect(result.data.category).toBeUndefined();
        expect(result.data.tags).toEqual([]);
      }
    });

    it('빈 태그를 거부해야 함', () => {
      const invalidInput = {
        title: 'Test',
        content: 'Content',
        tags: [''],
      };

      const result = CreateNoteInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('노트를 성공적으로 생성해야 함', async () => {
      const input = {
        title: 'My Test Note',
        content: '# Test Content\n\nThis is a test.',
        category: 'Projects' as const,
        tags: ['test', 'automated'],
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(result.content[0]?.text).toContain('노트가 생성되었습니다');
      expect(result.content[0]?.text).toContain(input.title);

      // 메타데이터 확인
      expect(result._meta?.metadata).toHaveProperty('id');
      expect(result._meta?.metadata).toHaveProperty('filePath');
    });

    it('파일 시스템에 노트를 저장해야 함', async () => {
      const input = {
        title: 'File System Test',
        content: 'Content to be saved',
      };

      const result = await executeTool('create_note', input, context);

      // 파일이 생성되었는지 확인
      const files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBeGreaterThan(0);

      const noteFile = files.find((f) => f.includes('file-system-test'));
      expect(noteFile).toBeDefined();

      if (noteFile) {
        const filePath = path.join(context.vaultPath, noteFile);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        expect(fileContent).toContain(input.title);
        expect(fileContent).toContain(input.content);
      }
    });

    it('특수 문자가 포함된 제목을 처리해야 함', async () => {
      const input = {
        title: 'Test: Special / Characters \\ & Symbols!',
        content: 'Content',
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();

      // 파일이 생성되었는지 확인
      const files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBeGreaterThan(0);
    });

    it('긴 제목을 적절히 처리해야 함', async () => {
      const longTitle = 'A'.repeat(200); // 200자 제목
      const input = {
        title: longTitle,
        content: 'Content',
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();

      // 파일명이 적절히 잘렸는지 확인
      const files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBeGreaterThan(0);

      // 파일명이 시스템 제한을 넘지 않는지 확인
      files.forEach((file) => {
        expect(file.length).toBeLessThan(255); // 대부분 파일시스템의 제한
      });
    });

    it('여러 태그를 처리해야 함', async () => {
      const input = {
        title: 'Multi-tag Test',
        content: 'Content',
        tags: ['tag1', 'tag2', 'tag3', 'tag4'],
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });

    it('프로젝트 링크를 처리해야 함', async () => {
      const input = {
        title: 'Project Linked Note',
        content: 'Content',
        project: 'my-project',
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('잘못된 입력에 대해 스키마 검증 에러를 반환해야 함', async () => {
      const invalidInput = {
        title: 'Test',
        // content 누락
      };

      await expect(
        executeTool('create_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });

    it('유효하지 않은 카테고리에 대해 에러를 반환해야 함', async () => {
      const invalidInput = {
        title: 'Test',
        content: 'Content',
        category: 'WrongCategory',
      };

      await expect(
        executeTool('create_note', invalidInput, context)
      ).rejects.toMatchObject({
        code: ErrorCode.SCHEMA_VALIDATION_ERROR,
      });
    });
  });

  describe('Optional Category (v2 Schema)', () => {
    it('should create note without category (Zettelkasten style)', async () => {
      const input = {
        title: 'Zettelkasten Note',
        content: 'This note has no PARA category',
      };

      const result = await executeTool('create_note', input, context);

      expect(result.content[0]?.type).toBe('text');
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain('노트가 생성되었습니다');
    });

    it('should allow both categorized and uncategorized notes', async () => {
      // Create note with category
      const withCategory = await executeTool(
        'create_note',
        {
          title: 'Categorized Note',
          content: 'This has a category',
          category: 'Projects',
        },
        context
      );

      // Create note without category
      const withoutCategory = await executeTool(
        'create_note',
        {
          title: 'Uncategorized Note',
          content: 'This has no category',
        },
        context
      );

      expect(withCategory.isError).toBeUndefined();
      expect(withoutCategory.isError).toBeUndefined();
    });
  });
});
