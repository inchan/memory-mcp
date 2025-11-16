/**
 * Front Matter 처리 단위 테스트
 *
 * 커버리지 목표: 47.89% → 75%+
 * 미테스트 함수: serializeFrontMatter, updateFrontMatter, addLinkToFrontMatter,
 *                removeLinkFromFrontMatter, addTagToFrontMatter, removeTagFromFrontMatter,
 *                generateFrontMatterFromTitle, validateFrontMatterField,
 *                frontMatterEquals, createFrontMatterSummary
 */

import {
  parseFrontMatter,
  serializeFrontMatter,
  serializeMarkdownNote,
  updateFrontMatter,
  addLinkToFrontMatter,
  removeLinkFromFrontMatter,
  addTagToFrontMatter,
  removeTagFromFrontMatter,
  generateFrontMatterFromTitle,
  validateFrontMatterField,
  frontMatterEquals,
  createFrontMatterSummary,
} from '../front-matter';
import { FrontMatter } from '@inchankang/zettel-memory-common';

describe('Front Matter 처리', () => {
  const validFrontMatter: FrontMatter = {
    id: '20250927T103000000000Z',
    title: 'Test Note',
    tags: ['test', 'example'],
    created: '2025-09-27T10:30:00.000Z',
    updated: '2025-09-27T10:30:00.000Z',
    links: ['link1', 'link2'],
  };

  const validFrontMatterWithCategory: FrontMatter = {
    ...validFrontMatter,
    category: 'Resources',
  };

  describe('parseFrontMatter', () => {
    it('should parse valid front matter', () => {
      const content = `---
id: "20250927T103000000000Z"
title: "Test Note"
tags: ["test", "example"]
created: "2025-09-27T10:30:00.000Z"
updated: "2025-09-27T10:30:00.000Z"
links: ["link1", "link2"]
---

# Content here`;

      const result = parseFrontMatter(content);

      expect(result.frontMatter.id).toBe('20250927T103000000000Z');
      expect(result.frontMatter.title).toBe('Test Note');
      expect(result.frontMatter.tags).toEqual(['test', 'example']);
      expect(result.content).toContain('# Content here');
      expect(result.isEmpty).toBe(false);
    });

    it('should parse front matter with PARA category', () => {
      const content = `---
id: "20250927T103000000000Z"
title: "Resource Note"
category: "Resources"
tags: []
created: "2025-09-27T10:30:00.000Z"
updated: "2025-09-27T10:30:00.000Z"
links: []
---

Content`;

      const result = parseFrontMatter(content);

      expect(result.frontMatter.category).toBe('Resources');
    });

    it('should throw error for empty front matter in strict mode', () => {
      const content = `---
---

Content without front matter`;

      expect(() => parseFrontMatter(content, 'test.md', true)).toThrow(
        'Front Matter가 없거나 비어있습니다'
      );
    });

    it('should return default front matter in non-strict mode', () => {
      const content = `---
---

Content`;

      const result = parseFrontMatter(content, 'test.md', false);

      expect(result.isEmpty).toBe(true);
      expect(result.frontMatter.id).toBeDefined();
      expect(result.frontMatter.title).toBe('Untitled');
    });

    it('should handle invalid front matter in non-strict mode', () => {
      const content = `---
title: "Test"
invalid_field: true
---

Content`;

      const result = parseFrontMatter(content, 'test.md', false);

      expect(result.frontMatter).toBeDefined();
      expect(result.isEmpty).toBe(false);
    });
  });

  describe('serializeFrontMatter', () => {
    it('should serialize valid front matter to YAML', () => {
      const result = serializeFrontMatter(validFrontMatter);

      expect(result).toContain('---');
      expect(result).toContain('id: 20250927T103000000000Z');
      expect(result).toContain('title: Test Note');
      expect(result).toContain('tags:');
      expect(result).toContain('  - test');
      expect(result).toContain('  - example');
    });

    it('should serialize front matter with category', () => {
      const result = serializeFrontMatter(validFrontMatterWithCategory);

      expect(result).toContain('category: Resources');
    });

    it('should remove undefined values', () => {
      const fmWithUndefined = {
        ...validFrontMatter,
        project: undefined,
      };

      const result = serializeFrontMatter(fmWithUndefined);

      // project 필드가 undefined이면 YAML에 포함되지 않아야 함
      expect(result).not.toContain('project: null');
      expect(result).not.toContain('project: undefined');
    });

    it('should throw error for invalid front matter', () => {
      const invalidFM = {
        id: 'invalid', // wrong format
        title: 'Test',
      } as unknown as FrontMatter;

      expect(() => serializeFrontMatter(invalidFM)).toThrow();
    });
  });

  describe('serializeMarkdownNote', () => {
    it('should serialize complete markdown note', () => {
      const note = {
        frontMatter: validFrontMatter,
        content: '# My Note\n\nThis is content.',
        filePath: '/path/to/note.md',
      };

      const result = serializeMarkdownNote(note);

      expect(result).toContain('---');
      expect(result).toContain('id: 20250927T103000000000Z');
      expect(result).toContain('# My Note');
      expect(result).toContain('This is content.');
    });

    it('should separate front matter and content correctly', () => {
      const note = {
        frontMatter: validFrontMatter,
        content: 'Content body',
        filePath: '/test.md',
      };

      const result = serializeMarkdownNote(note);

      // Front matter와 content 사이에 빈 줄이 있어야 함
      expect(result).toContain('---\n\nContent body');
    });
  });

  describe('updateFrontMatter', () => {
    it('should update title', () => {
      const result = updateFrontMatter(validFrontMatter, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
      expect(result.id).toBe(validFrontMatter.id); // ID는 변경되지 않음
    });

    it('should auto-update timestamp', () => {
      const originalUpdated = validFrontMatter.updated;
      const result = updateFrontMatter(validFrontMatter, {
        title: 'New Title',
      });

      expect(result.updated).not.toBe(originalUpdated);
      expect(new Date(result.updated).getTime()).toBeGreaterThan(
        new Date(originalUpdated).getTime()
      );
    });

    it('should preserve timestamp when updateTimestamp is false', () => {
      const result = updateFrontMatter(
        validFrontMatter,
        { title: 'New Title' },
        { updateTimestamp: false }
      );

      expect(result.updated).toBe(validFrontMatter.updated);
    });

    it('should update tags array', () => {
      const result = updateFrontMatter(validFrontMatter, {
        tags: ['new-tag', 'another-tag'],
      });

      expect(result.tags).toEqual(['new-tag', 'another-tag']);
    });

    it('should update links array', () => {
      const result = updateFrontMatter(validFrontMatter, {
        links: ['newlink1', 'newlink2', 'newlink3'],
      });

      expect(result.links).toEqual(['newlink1', 'newlink2', 'newlink3']);
    });

    it('should add optional category', () => {
      const result = updateFrontMatter(validFrontMatter, {
        category: 'Projects',
      });

      expect(result.category).toBe('Projects');
    });

    it('should add optional project field', () => {
      const result = updateFrontMatter(validFrontMatter, {
        project: 'my-project',
      });

      expect(result.project).toBe('my-project');
    });
  });

  describe('addLinkToFrontMatter', () => {
    it('should add new link', () => {
      const result = addLinkToFrontMatter(validFrontMatter, 'newlink');

      expect(result.links).toContain('newlink');
      expect(result.links).toContain('link1');
      expect(result.links).toContain('link2');
      expect(result.links.length).toBe(3);
    });

    it('should not add duplicate link', () => {
      const result = addLinkToFrontMatter(validFrontMatter, 'link1');

      expect(result.links).toEqual(validFrontMatter.links);
      expect(result.links.length).toBe(2);
    });

    it('should handle empty links array', () => {
      const fmNoLinks = { ...validFrontMatter, links: [] };
      const result = addLinkToFrontMatter(fmNoLinks, 'firstlink');

      expect(result.links).toEqual(['firstlink']);
    });
  });

  describe('removeLinkFromFrontMatter', () => {
    it('should remove existing link', () => {
      const result = removeLinkFromFrontMatter(validFrontMatter, 'link1');

      expect(result.links).not.toContain('link1');
      expect(result.links).toContain('link2');
      expect(result.links.length).toBe(1);
    });

    it('should not affect other links', () => {
      const result = removeLinkFromFrontMatter(validFrontMatter, 'link2');

      expect(result.links).toEqual(['link1']);
    });

    it('should handle non-existent link', () => {
      const result = removeLinkFromFrontMatter(validFrontMatter, 'nonexistent');

      expect(result.links).toEqual(validFrontMatter.links);
    });
  });

  describe('addTagToFrontMatter', () => {
    it('should add new tag', () => {
      const result = addTagToFrontMatter(validFrontMatter, 'newtag');

      expect(result.tags).toContain('newtag');
      expect(result.tags).toContain('test');
      expect(result.tags).toContain('example');
      expect(result.tags.length).toBe(3);
    });

    it('should not add duplicate tag', () => {
      const result = addTagToFrontMatter(validFrontMatter, 'test');

      expect(result.tags).toEqual(validFrontMatter.tags);
      expect(result.tags.length).toBe(2);
    });
  });

  describe('removeTagFromFrontMatter', () => {
    it('should remove existing tag', () => {
      const result = removeTagFromFrontMatter(validFrontMatter, 'test');

      expect(result.tags).not.toContain('test');
      expect(result.tags).toContain('example');
      expect(result.tags.length).toBe(1);
    });

    it('should handle non-existent tag', () => {
      const result = removeTagFromFrontMatter(validFrontMatter, 'nothere');

      expect(result.tags).toEqual(validFrontMatter.tags);
    });
  });

  describe('generateFrontMatterFromTitle', () => {
    it('should generate front matter with title', () => {
      const result = generateFrontMatterFromTitle('My New Note');

      expect(result.id).toBeDefined();
      expect(result.title).toBe('My New Note');
      expect(result.tags).toEqual([]);
      expect(result.links).toEqual([]);
      expect(result.created).toBeDefined();
      expect(result.updated).toBeDefined();
    });

    it('should generate front matter with category', () => {
      const result = generateFrontMatterFromTitle('Project Note', 'Projects');

      expect(result.title).toBe('Project Note');
      expect(result.category).toBe('Projects');
    });

    it('should merge additional data', () => {
      const result = generateFrontMatterFromTitle('Note', undefined, {
        tags: ['custom'],
        project: 'test-project',
      });

      expect(result.tags).toEqual(['custom']);
      expect(result.project).toBe('test-project');
    });

    it('should validate generated front matter', () => {
      // This should not throw
      const result = generateFrontMatterFromTitle('Valid Note', 'Areas');

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^\d{8}T\d{12}Z$/);
    });
  });

  describe('validateFrontMatterField', () => {
    it('should validate valid id', () => {
      expect(validateFrontMatterField('id', '20250927T103000000000Z')).toBe(
        true
      );
    });

    it('should reject invalid id format', () => {
      expect(validateFrontMatterField('id', 'invalid-id')).toBe(false);
    });

    it('should validate valid title', () => {
      expect(validateFrontMatterField('title', 'Valid Title')).toBe(true);
    });

    it('should reject empty title', () => {
      expect(validateFrontMatterField('title', '')).toBe(false);
    });

    it('should validate valid category', () => {
      expect(validateFrontMatterField('category', 'Projects')).toBe(true);
      expect(validateFrontMatterField('category', 'Areas')).toBe(true);
      expect(validateFrontMatterField('category', 'Resources')).toBe(true);
      expect(validateFrontMatterField('category', 'Archives')).toBe(true);
    });

    it('should reject invalid category', () => {
      expect(validateFrontMatterField('category', 'Invalid')).toBe(false);
    });

    it('should validate tags array', () => {
      expect(validateFrontMatterField('tags', ['tag1', 'tag2'])).toBe(true);
      expect(validateFrontMatterField('tags', [])).toBe(true);
    });

    it('should reject invalid tags', () => {
      expect(validateFrontMatterField('tags', 'not-array')).toBe(false);
    });

    it('should validate ISO timestamp', () => {
      expect(
        validateFrontMatterField('created', '2025-09-27T10:30:00.000Z')
      ).toBe(true);
    });

    it('should reject invalid timestamp', () => {
      expect(validateFrontMatterField('created', 'invalid-date')).toBe(false);
    });
  });

  describe('frontMatterEquals', () => {
    it('should return true for identical front matters', () => {
      const fm1 = { ...validFrontMatter };
      const fm2 = { ...validFrontMatter };

      expect(frontMatterEquals(fm1, fm2)).toBe(true);
    });

    it('should return false for different titles', () => {
      const fm1 = { ...validFrontMatter };
      const fm2 = { ...validFrontMatter, title: 'Different' };

      expect(frontMatterEquals(fm1, fm2)).toBe(false);
    });

    it('should return false for different tags', () => {
      const fm1 = { ...validFrontMatter };
      const fm2 = { ...validFrontMatter, tags: ['different'] };

      expect(frontMatterEquals(fm1, fm2)).toBe(false);
    });

    it('should return false for different links', () => {
      const fm1 = { ...validFrontMatter };
      const fm2 = { ...validFrontMatter, links: ['other'] };

      expect(frontMatterEquals(fm1, fm2)).toBe(false);
    });

    it('should handle deeply nested comparison', () => {
      const fm1 = { ...validFrontMatter, tags: ['a', 'b'] };
      const fm2 = { ...validFrontMatter, tags: ['a', 'b'] };

      expect(frontMatterEquals(fm1, fm2)).toBe(true);
    });
  });

  describe('createFrontMatterSummary', () => {
    it('should create summary with all fields', () => {
      const summary = createFrontMatterSummary(validFrontMatterWithCategory);

      expect(summary.id).toBe('20250927T103000000000Z');
      expect(summary.title).toBe('Test Note');
      expect(summary.category).toBe('Resources');
      expect(summary.tagCount).toBe(2);
      expect(summary.linkCount).toBe(2);
      expect(summary.created).toBe('2025-09-27T10:30:00.000Z');
      expect(summary.updated).toBe('2025-09-27T10:30:00.000Z');
    });

    it('should handle front matter without category', () => {
      const summary = createFrontMatterSummary(validFrontMatter);

      expect(summary.category).toBeUndefined();
    });

    it('should handle empty tags and links', () => {
      const fmEmpty = {
        ...validFrontMatter,
        tags: [],
        links: [],
      };
      const summary = createFrontMatterSummary(fmEmpty);

      expect(summary.tagCount).toBe(0);
      expect(summary.linkCount).toBe(0);
    });

    it('should include project field if present', () => {
      const fmWithProject = {
        ...validFrontMatter,
        project: 'test-project',
      };
      const summary = createFrontMatterSummary(fmWithProject);

      expect(summary.project).toBe('test-project');
    });
  });
});
