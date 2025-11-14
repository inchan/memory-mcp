/**
 * 스토리지 통합 테스트
 * 노트 작성 → 파일 시스템 저장 → Front Matter 파싱 통합
 */

import { executeTool } from '../../src/tools';
import { createTestContext, cleanupTestContext } from '../test-helpers';
import type { ToolExecutionContext } from '../../src/tools/types';
import * as fs from 'fs';
import * as path from 'path';
import { loadNote, parseFrontMatter } from '@inchan/zettel-memory-storage-md';

describe('Storage Integration Tests', () => {
  let context: ToolExecutionContext;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('노트 작성 → 파일 시스템 저장', () => {
    it('노트를 작성하면 파일 시스템에 저장되어야 함', async () => {
      const input = {
        title: 'Integration Test Note',
        content: '# Test\n\nThis is an integration test.',
        category: 'Resources' as const,
        tags: ['integration', 'test'],
      };

      const result = await executeTool('create_note', input, context);

      // 파일이 생성되었는지 확인
      const files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBeGreaterThan(0);

      const noteFile = files[0];
      expect(noteFile).toBeDefined();

      if (noteFile) {
        const filePath = path.join(context.vaultPath, noteFile);
        const stats = fs.statSync(filePath);
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeGreaterThan(0);
      }
    });

    it('저장된 파일에 올바른 Front Matter가 포함되어야 함', async () => {
      const input = {
        title: 'Front Matter Test',
        content: 'Content here',
        category: 'Projects' as const,
        tags: ['tag1', 'tag2'],
        project: 'test-project',
      };

      const result = await executeTool('create_note', input, context);
      const uid = result._meta?.metadata?.id;

      // 파일 읽기
      const files = fs.readdirSync(context.vaultPath);
      const noteFile = files[0];
      const filePath = path.join(context.vaultPath, noteFile!);
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Front Matter 파싱
      const { frontMatter, content } = parseFrontMatter(fileContent);

      expect(frontMatter.id).toBe(uid);
      expect(frontMatter.title).toBe(input.title);
      expect(frontMatter.category).toBe(input.category);
      expect(frontMatter.tags).toEqual(input.tags);
      expect(frontMatter.project).toBe(input.project);
      expect(content.trim()).toBe(input.content);
    });

    it('노트를 읽을 때 Front Matter가 올바르게 파싱되어야 함', async () => {
      const input = {
        title: 'Parse Test',
        content: 'Test content',
        category: 'Areas' as const,
        tags: ['parse'],
      };

      const createResult = await executeTool('create_note', input, context);
      const uid = createResult._meta?.metadata?.id;

      // 노트 읽기
      const readResult = await executeTool('read_note', { uid }, context);

      expect(readResult.content[0]?.text).toContain(input.title);
      expect(readResult.content[0]?.text).toContain(input.content);
    });
  });

  describe('Front Matter 직렬화 및 역직렬화', () => {
    it('undefined 값이 올바르게 처리되어야 함', async () => {
      const input = {
        title: 'Optional Fields Test',
        content: 'Content',
        // project는 undefined
      };

      const result = await executeTool('create_note', input, context);
      const uid = result._meta?.metadata?.id;

      // 파일 읽기
      const files = fs.readdirSync(context.vaultPath);
      const filePath = path.join(context.vaultPath, files[0]!);
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // undefined가 문자열로 저장되지 않았는지 확인
      expect(fileContent).not.toContain('undefined');
      expect(fileContent).not.toContain('project: undefined');
    });

    it('빈 배열이 올바르게 처리되어야 함', async () => {
      const input = {
        title: 'Empty Arrays Test',
        content: 'Content',
        tags: [],
        links: [],
      };

      const result = await executeTool('create_note', input, context);

      // 파일 읽기
      const files = fs.readdirSync(context.vaultPath);
      const filePath = path.join(context.vaultPath, files[0]!);
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      const { frontMatter } = parseFrontMatter(fileContent);
      expect(frontMatter.tags).toEqual([]);
      expect(frontMatter.links).toEqual([]);
    });

    it('노트 업데이트 시 Front Matter가 올바르게 업데이트되어야 함', async () => {
      // 노트 생성
      const createResult = await executeTool(
        'create_note',
        {
          title: 'Original',
          content: 'Original content',
          tags: ['old'],
        },
        context
      );
      const uid = createResult._meta?.metadata?.id;

      // 노트 업데이트
      await executeTool(
        'update_note',
        {
          uid,
          title: 'Updated',
          tags: ['new', 'updated'],
        },
        context
      );

      // 파일 읽기
      const files = fs.readdirSync(context.vaultPath);
      const filePath = path.join(context.vaultPath, files[0]!);
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      const { frontMatter } = parseFrontMatter(fileContent);
      expect(frontMatter.title).toBe('Updated');
      expect(frontMatter.tags).toEqual(['new', 'updated']);
      expect(frontMatter.updated).not.toBe(frontMatter.created);
    });
  });

  describe('파일 시스템 동기화', () => {
    it('여러 노트를 생성해도 충돌하지 않아야 함', async () => {
      const notes = [
        { title: 'Note 1', content: 'Content 1' },
        { title: 'Note 2', content: 'Content 2' },
        { title: 'Note 3', content: 'Content 3' },
      ];

      for (const note of notes) {
        await executeTool('create_note', note, context);
      }

      const files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBe(3);

      // 모든 파일이 유효한지 확인
      for (const file of files) {
        const filePath = path.join(context.vaultPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontMatter(content);
        expect(parsed.frontMatter.title).toBeDefined();
      }
    });

    it('삭제된 노트는 파일 시스템에서도 제거되어야 함', async () => {
      const createResult = await executeTool(
        'create_note',
        { title: 'To Delete', content: 'Will be deleted' },
        context
      );
      const uid = createResult._meta?.metadata?.id;

      // 파일 존재 확인
      let files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBe(1);

      // 노트 삭제
      await executeTool('delete_note', { uid, confirm: true }, context);

      // 파일이 삭제되었는지 확인
      files = fs.readdirSync(context.vaultPath);
      expect(files.length).toBe(0);
    });
  });
});
