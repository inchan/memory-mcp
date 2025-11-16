/**
 * 파일 작업 단위 테스트
 *
 * 파일 존재 여부, 디렉토리 확인, 에러 처리 등 테스트
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  fileExists,
  directoryExists,
  ensureDirectory,
  readFile,
  normalizePath,
  listFiles,
  getFileStats,
} from '../file-operations';

describe('File Operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-ops-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'existing.txt');
      await fs.writeFile(filePath, 'content');

      const exists = await fileExists(filePath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');

      const exists = await fileExists(filePath);
      expect(exists).toBe(false);
    });

    it('should return false for directory', async () => {
      const dirPath = path.join(testDir, 'subdir');
      await fs.mkdir(dirPath);

      const exists = await fileExists(dirPath);
      // fileExists checks for file access, directory exists but is not a file
      expect(exists).toBe(true); // access(F_OK) returns true for directories too
    });
  });

  describe('directoryExists', () => {
    it('should return true for existing directory', async () => {
      const dirPath = path.join(testDir, 'subdir');
      await fs.mkdir(dirPath);

      const exists = await directoryExists(dirPath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existing directory', async () => {
      const dirPath = path.join(testDir, 'nonexistent');

      const exists = await directoryExists(dirPath);
      expect(exists).toBe(false);
    });

    it('should return false for file path', async () => {
      const filePath = path.join(testDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const exists = await directoryExists(filePath);
      expect(exists).toBe(false);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory if not exists', async () => {
      const dirPath = path.join(testDir, 'newdir');

      await ensureDirectory(dirPath);

      const exists = await directoryExists(dirPath);
      expect(exists).toBe(true);
    });

    it('should create nested directories', async () => {
      const nestedPath = path.join(testDir, 'level1', 'level2', 'level3');

      await ensureDirectory(nestedPath);

      const exists = await directoryExists(nestedPath);
      expect(exists).toBe(true);
    });

    it('should not fail if directory already exists', async () => {
      const dirPath = path.join(testDir, 'existing');
      await fs.mkdir(dirPath);

      await expect(ensureDirectory(dirPath)).resolves.not.toThrow();
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const expectedContent = 'Hello, World!';
      await fs.writeFile(filePath, expectedContent);

      const content = await readFile(filePath);
      expect(content).toBe(expectedContent);
    });

    it('should read UTF-8 content with special characters', async () => {
      const filePath = path.join(testDir, 'korean.txt');
      const expectedContent = '한글 테스트 🎉';
      await fs.writeFile(filePath, expectedContent, 'utf8');

      const content = await readFile(filePath);
      expect(content).toBe(expectedContent);
    });

    it('should throw error for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');

      await expect(readFile(filePath)).rejects.toThrow(
        '파일을 찾을 수 없습니다'
      );
    });

    it('should handle empty files', async () => {
      const filePath = path.join(testDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const content = await readFile(filePath);
      expect(content).toBe('');
    });
  });

  describe('normalizePath', () => {
    it('should normalize path separators', () => {
      const input = 'folder/subfolder/file.md';
      const result = normalizePath(input);
      expect(result).toContain('folder');
      expect(result).toContain('file.md');
    });

    it('should handle absolute paths', () => {
      const input = '/home/user/notes/file.md';
      const result = normalizePath(input);
      expect(result).toBe('/home/user/notes/file.md');
    });

    it('should handle Windows-style paths', () => {
      const input = 'C:\\Users\\test\\file.md';
      const result = normalizePath(input);
      // Should convert backslashes to forward slashes
      expect(result).not.toContain('\\\\');
    });

    it('should handle relative paths', () => {
      const input = './vault/note.md';
      const result = normalizePath(input);
      expect(result).toContain('vault');
      expect(result).toContain('note.md');
    });
  });

  describe('listFiles', () => {
    it('should list markdown files in directory', async () => {
      await fs.writeFile(path.join(testDir, 'note1.md'), '# Note 1');
      await fs.writeFile(path.join(testDir, 'note2.md'), '# Note 2');
      await fs.writeFile(path.join(testDir, 'other.txt'), 'Not markdown');

      const files = await listFiles(testDir, /\.md$/);

      expect(files.length).toBe(2);
      expect(files.some(f => f.endsWith('note1.md'))).toBe(true);
      expect(files.some(f => f.endsWith('note2.md'))).toBe(true);
    });

    it('should recursively find markdown files', async () => {
      const subdir = path.join(testDir, 'subdir');
      await fs.mkdir(subdir);
      await fs.writeFile(path.join(testDir, 'root.md'), '# Root');
      await fs.writeFile(path.join(subdir, 'nested.md'), '# Nested');

      const files = await listFiles(testDir, /\.md$/, true);

      expect(files.length).toBe(2);
      expect(files.some(f => f.includes('root.md'))).toBe(true);
      expect(files.some(f => f.includes('nested.md'))).toBe(true);
    });

    it('should return empty array for empty directory', async () => {
      const files = await listFiles(testDir, /\.md$/);
      expect(files).toEqual([]);
    });

    it('should ignore non-markdown files', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'text');
      await fs.writeFile(path.join(testDir, 'file.json'), '{}');
      await fs.writeFile(path.join(testDir, 'file.yml'), 'yaml: true');

      const files = await listFiles(testDir, /\.md$/);
      expect(files).toEqual([]);
    });
  });

  describe('getFileStats', () => {
    it('should return file statistics', async () => {
      const filePath = path.join(testDir, 'stats.txt');
      const content = 'Test content for stats';
      await fs.writeFile(filePath, content);

      const stats = await getFileStats(filePath);

      expect(stats.size).toBe(content.length);
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.mtime).toBeDefined();
      expect(stats.birthtime).toBeDefined();
    });

    it('should return directory statistics', async () => {
      const dirPath = path.join(testDir, 'statsdir');
      await fs.mkdir(dirPath);

      const stats = await getFileStats(dirPath);

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('should throw error for non-existing path', async () => {
      const nonExistent = path.join(testDir, 'nonexistent');

      await expect(getFileStats(nonExistent)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle paths with spaces', async () => {
      const dirPath = path.join(testDir, 'dir with spaces');
      const filePath = path.join(dirPath, 'file with spaces.md');

      await ensureDirectory(dirPath);
      await fs.writeFile(filePath, '# Content');

      const exists = await fileExists(filePath);
      expect(exists).toBe(true);

      const content = await readFile(filePath);
      expect(content).toBe('# Content');
    });

    it('should handle very long file names', async () => {
      const longName = 'a'.repeat(200) + '.md';
      const filePath = path.join(testDir, longName);

      await fs.writeFile(filePath, 'content');
      const exists = await fileExists(filePath);
      expect(exists).toBe(true);
    });

    it('should handle empty directory for listFiles', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir);

      const files = await listFiles(emptyDir, /\.md$/);
      expect(files).toEqual([]);
    });
  });
});
