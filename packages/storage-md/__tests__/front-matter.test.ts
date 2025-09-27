/**
 * Front Matter 처리 모듈 테스트
 */

import {
  parseFrontMatter,
  serializeFrontMatter,
  updateFrontMatter,
  validateFrontMatter,
} from '../src/front-matter';
import { FrontMatter } from '@memory-mcp/common';

describe('Front Matter Processing', () => {
  describe('parseFrontMatter', () => {
    test('유효한 Front Matter 파싱', () => {
      const content = `---
id: "20250927T103000123456Z"
title: "Test Note"
category: "Resources"
tags: ["test", "example"]
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
links: []
---

# Content

Test content here.`;

      const result = parseFrontMatter(content);
      
      expect(result.frontMatter.id).toBe('20250927T103000123456Z');
      expect(result.frontMatter.title).toBe('Test Note');
      expect(result.frontMatter.category).toBe('Resources');
      expect(result.frontMatter.tags).toEqual(['test', 'example']);
      expect(result.content.trim()).toBe('# Content\n\nTest content here.');
    });

    test('Front Matter가 없는 경우 기본값 생성', () => {
      const content = '# Just Content\n\nNo front matter here.';
      
      const result = parseFrontMatter(content, 'test.md', false);
      
      expect(result.frontMatter.title).toBe('Untitled');
      expect(result.frontMatter.category).toBe('Resources');
      expect(result.frontMatter.tags).toEqual([]);
      expect(result.content).toBe(content);
    });

    test('잘못된 Front Matter - 엄격 모드', () => {
      const content = `---
invalid yaml: [unclosed
title: "Test"
---

Content`;

      expect(() => {
        parseFrontMatter(content, 'test.md', true);
      }).toThrow();
    });

    test('잘못된 Front Matter - 비엄격 모드', () => {
      const content = `---
invalid yaml: [unclosed
title: "Test"
---

Content`;

      const result = parseFrontMatter(content, 'test.md', false);
      
      expect(result.frontMatter.title).toBe('Untitled');
      expect(result.content).toBe('Content');
    });
  });

  describe('serializeFrontMatter', () => {
    test('Front Matter 직렬화', () => {
      const frontMatter: FrontMatter = {
        id: '20250927T103000123456Z',
        title: 'Test Note',
        category: 'Resources',
        tags: ['test'],
        created: '2025-09-27T10:30:00Z',
        updated: '2025-09-27T10:30:00Z',
        links: [],
      };

      const content = 'Test content';
      const serialized = serializeFrontMatter(frontMatter, content);

      expect(serialized).toContain('---');
      expect(serialized).toContain('title: Test Note');
      expect(serialized).toContain('category: Resources');
      expect(serialized).toContain('Test content');
    });
  });

  describe('validateFrontMatter', () => {
    test('유효한 Front Matter 검증', () => {
      const frontMatter: FrontMatter = {
        id: '20250927T103000123456Z',
        title: 'Test Note',
        category: 'Resources',
        tags: ['test'],
        created: '2025-09-27T10:30:00Z',
        updated: '2025-09-27T10:30:00Z',
        links: [],
      };

      expect(() => {
        validateFrontMatter(frontMatter);
      }).not.toThrow();
    });

    test('잘못된 Front Matter 검증', () => {
      const invalidFrontMatter = {
        id: 'invalid-id',
        title: '',
        category: 'InvalidCategory',
      } as any;

      expect(() => {
        validateFrontMatter(invalidFrontMatter);
      }).toThrow();
    });
  });

  describe('updateFrontMatter', () => {
    test('Front Matter 업데이트', () => {
      const original: FrontMatter = {
        id: '20250927T103000123456Z',
        title: 'Original Title',
        category: 'Resources',
        tags: ['original'],
        created: '2025-09-27T10:30:00Z',
        updated: '2025-09-27T10:30:00Z',
        links: [],
      };

      const updates = {
        title: 'Updated Title',
        tags: ['updated', 'test'],
      };

      const updated = updateFrontMatter(original, updates);

      expect(updated.title).toBe('Updated Title');
      expect(updated.tags).toEqual(['updated', 'test']);
      expect(updated.id).toBe(original.id);
      expect(updated.created).toBe(original.created);
      expect(updated.updated).not.toBe(original.updated);
    });
  });
});