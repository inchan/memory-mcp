/**
 * 유틸리티 함수 단위 테스트
 *
 * common/src/utils.ts의 미테스트된 함수들 검증
 * 커버리지 목표: 55% → 80%+
 */

import {
  generateUid,
  normalizePath,
  parseAllLinks,
  logger,
  createSnippet,
  debounce,
  formatFileSize,
  extractBacklinkContext,
  removeExtension,
} from '../utils';

describe('유틸리티 함수 테스트', () => {
  describe('generateUid', () => {
    it('should generate unique UIDs', () => {
      const uid1 = generateUid();
      const uid2 = generateUid();

      expect(uid1).not.toBe(uid2);
    });

    it('should generate UID with correct format', () => {
      const uid = generateUid();

      // Format: YYYYMMDDTHHMMSSssssssZ (timestamp based with microseconds)
      // Example: 20251115T181302165003Z (22 chars)
      expect(uid).toMatch(/^\d{8}T\d{12}Z$/);
      expect(uid.length).toBe(22);
    });

    it('should generate UIDs in chronological order', () => {
      const uids: string[] = [];
      for (let i = 0; i < 10; i++) {
        uids.push(generateUid());
      }

      // Each UID should be >= previous (chronological)
      for (let i = 1; i < uids.length; i++) {
        const current = uids[i]!;
        const prev = uids[i - 1]!;
        expect(current >= prev).toBe(true);
      }
    });
  });

  describe('normalizePath', () => {
    it('should normalize Windows paths to Unix style', () => {
      const result = normalizePath('C:\\Users\\test\\file.md');
      expect(result).not.toContain('\\');
    });

    it('should handle already normalized paths', () => {
      const path = '/home/user/file.md';
      expect(normalizePath(path)).toBe(path);
    });

    it('should handle relative paths', () => {
      const path = './vault/note.md';
      const result = normalizePath(path);
      expect(result).toContain('vault/note.md');
    });

    it('should handle paths with spaces', () => {
      const path = '/home/user/my notes/file.md';
      const result = normalizePath(path);
      expect(result).toContain('my notes');
    });
  });

  describe('removeExtension', () => {
    it('should remove file extension', () => {
      expect(removeExtension('file.md')).toBe('file');
      expect(removeExtension('note.txt')).toBe('note');
      expect(removeExtension('script.js')).toBe('script');
    });

    it('should handle paths with extension', () => {
      expect(removeExtension('/path/to/file.md')).toBe('/path/to/file');
      expect(removeExtension('./vault/note.txt')).toBe('./vault/note');
    });

    it('should handle multiple dots', () => {
      expect(removeExtension('file.test.ts')).toBe('file.test');
      expect(removeExtension('my.note.md')).toBe('my.note');
    });

    it('should handle no extension', () => {
      expect(removeExtension('noextension')).toBe('noextension');
    });

    it('should handle hidden files', () => {
      // Hidden files are treated as having an extension (dot + name)
      expect(removeExtension('.gitignore')).toBe('');
      expect(removeExtension('.env')).toBe('');
      // Hidden files with extension keep the hidden part
      expect(removeExtension('.config.json')).toBe('.config');
    });
  });

  describe('parseAllLinks', () => {
    it('should parse wiki links [[...]]', () => {
      const content = 'See [[note-id]] for more info';
      const result = parseAllLinks(content);

      expect(result.wiki).toContain('note-id');
      expect(result.all).toContain('note-id');
    });

    it('should parse wiki links with display text [[id|text]]', () => {
      const content = 'See [[note-id|Display Text]] for more';
      const result = parseAllLinks(content);

      expect(result.wiki).toContain('note-id');
    });

    it('should parse markdown links [text](url)', () => {
      const content = 'Visit [Google](https://google.com)';
      const result = parseAllLinks(content);

      expect(result.markdown).toContain('https://google.com');
      expect(result.all).toContain('https://google.com');
    });

    it('should parse multiple links', () => {
      const content = `
        Wiki: [[link1]] and [[link2|text]]
        Markdown: [text](link3)
      `;
      const result = parseAllLinks(content);

      expect(result.all.length).toBeGreaterThanOrEqual(3);
      expect(result.wiki).toContain('link1');
      expect(result.wiki).toContain('link2');
      expect(result.markdown).toContain('link3');
    });

    it('should handle empty content', () => {
      const result = parseAllLinks('');

      expect(result.wiki).toHaveLength(0);
      expect(result.markdown).toHaveLength(0);
      expect(result.all).toHaveLength(0);
    });

    it('should deduplicate links', () => {
      const content = '[[same]] and [[same]] again';
      const result = parseAllLinks(content);

      // all should be deduplicated
      const uniqueLinks = [...new Set(result.all)];
      expect(result.all.length).toBe(uniqueLinks.length);
    });
  });

  describe('createSnippet', () => {
    it('should create snippet around search term', () => {
      const content =
        'This is a long text with search term in the middle of it.';
      const result = createSnippet(content, 'search term', 50);

      expect(result).toContain('search term');
    });

    it('should handle search term at start', () => {
      const content = 'search term is at the beginning';
      const result = createSnippet(content, 'search term', 20);

      expect(result).toContain('search term');
    });

    it('should handle search term at end', () => {
      const content = 'at the end is search term';
      const result = createSnippet(content, 'search term', 50);

      expect(result).toContain('search term');
    });

    it('should return content when no match', () => {
      const content = 'This has no match';
      const result = createSnippet(content, 'nonexistent', 20);

      // createSnippet returns truncated content even without match
      expect(result).toBeDefined();
    });

    it('should be case insensitive', () => {
      const content = 'SEARCH TERM in uppercase';
      const result = createSnippet(content, 'search term', 30);

      expect(result).toContain('SEARCH');
    });

    it('should add ellipsis when truncated', () => {
      const content = 'A'.repeat(100) + ' search term ' + 'B'.repeat(100);
      const result = createSnippet(content, 'search term', 20);

      expect(result).toContain('...');
    });
  });

  describe('Logger', () => {
    let originalConsole: typeof console;

    beforeEach(() => {
      originalConsole = { ...console };
      console.info = jest.fn();
      console.error = jest.fn();
      console.warn = jest.fn();
      console.debug = jest.fn();
    });

    afterEach(() => {
      console.info = originalConsole.info;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.debug = originalConsole.debug;
      logger.setLevel('info'); // Reset to default
    });

    it('should log info messages', () => {
      logger.setLevel('info');
      logger.info('Test info message');

      expect(console.info).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.setLevel('info');
      logger.error('Test error message');

      expect(console.error).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.setLevel('warn');
      logger.warn('Test warning');

      expect(console.warn).toHaveBeenCalled();
    });

    it('should respect log level - debug not shown at info level', () => {
      logger.setLevel('info');
      logger.debug('Debug message');

      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should show debug at debug level', () => {
      logger.setLevel('debug');
      logger.debug('Debug message');

      expect(console.debug).toHaveBeenCalled();
    });

    it('should filter messages below threshold', () => {
      logger.setLevel('error');
      logger.info('Info message');
      logger.warn('Warn message');

      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should log with metadata', () => {
      logger.setLevel('info');
      logger.info('Message with metadata', { key: 'value' });

      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string in parseAllLinks', () => {
      const result = parseAllLinks('');
      expect(result.all).toHaveLength(0);
      expect(result.wiki).toHaveLength(0);
      expect(result.markdown).toHaveLength(0);
    });

    it('should handle very long content in createSnippet', () => {
      const longContent =
        'word '.repeat(1000) + 'target' + ' word'.repeat(1000);
      const result = createSnippet(longContent, 'target', 50);

      expect(result).toContain('target');
      expect(result.length).toBeLessThan(200);
    });

    it('should handle special characters in links', () => {
      const content = '[[note-with-dash]] and [[note_underscore]]';
      const result = parseAllLinks(content);

      expect(result.wiki.length).toBeGreaterThanOrEqual(2);
      expect(result.wiki).toContain('note-with-dash');
      expect(result.wiki).toContain('note_underscore');
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      jest.advanceTimersByTime(50);
      debouncedFn();
      jest.advanceTimersByTime(50);

      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to debounced function', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should only call once after rapid successive calls', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500.0 B');
      expect(formatFileSize(1023)).toBe('1023.0 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(5242880)).toBe('5.0 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.0 GB');
      expect(formatFileSize(2147483648)).toBe('2.0 GB');
    });

    it('should handle zero bytes', () => {
      expect(formatFileSize(0)).toBe('0.0 B');
    });

    it('should handle decimal places', () => {
      const result = formatFileSize(1500);
      expect(result).toContain('KB');
      expect(parseFloat(result)).toBeCloseTo(1.5, 1);
    });
  });

  describe('extractBacklinkContext', () => {
    const sampleContent = `# Introduction
This is the first line.
Here we reference [[note-id]].
More content here.
And some final lines.
Last line of the note.`;

    it('should extract context around wiki links', () => {
      const result = extractBacklinkContext(sampleContent, 'note-id', 1);

      expect(result).toHaveLength(1);
      expect(result[0]!.linkType).toBe('wiki');
      expect(result[0]!.snippet).toContain('[[note-id]]');
      expect(result[0]!.lineNumber).toBe(3);
    });

    it('should include specified number of context lines', () => {
      const result = extractBacklinkContext(sampleContent, 'note-id', 2);

      expect(result[0]!.snippet).toContain('This is the first line');
      expect(result[0]!.snippet).toContain('More content here');
    });

    it('should extract markdown link context', () => {
      const content = `First line
Second line
See [link text](target-note) for details.
Fourth line
Last line`;

      const result = extractBacklinkContext(content, 'target-note', 1);

      expect(result).toHaveLength(1);
      expect(result[0]!.linkType).toBe('markdown');
      expect(result[0]!.lineNumber).toBe(3);
    });

    it('should handle multiple links in content', () => {
      const content = `Line 1
[[note-a]] first reference
Line 3
[[note-a]] second reference
Line 5`;

      const result = extractBacklinkContext(content, 'note-a', 0);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle wiki links with display text', () => {
      const content = 'Reference [[note-id|Custom Display]] here';
      const result = extractBacklinkContext(content, 'note-id', 0);

      expect(result).toHaveLength(1);
      expect(result[0]!.linkType).toBe('wiki');
    });

    it('should return empty array when no links found', () => {
      const content = 'No links in this content';
      const result = extractBacklinkContext(content, 'nonexistent', 1);

      expect(result).toHaveLength(0);
    });

    it('should handle edge case at beginning of file', () => {
      const content = `[[first-note]] at the start
Second line`;

      const result = extractBacklinkContext(content, 'first-note', 2);

      expect(result).toHaveLength(1);
      expect(result[0]!.lineNumber).toBe(1);
    });

    it('should handle edge case at end of file', () => {
      const content = `First line
Last [[end-note]]`;

      const result = extractBacklinkContext(content, 'end-note', 2);

      expect(result).toHaveLength(1);
      expect(result[0]!.lineNumber).toBe(2);
    });
  });
});
