/**
 * 파일 시스템 조작 테스트
 */

import {
  atomicWrite,
  safeRead,
  ensureDirectory,
  getFileInfo,
  listMarkdownFiles,
} from '../src/file-operations';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

describe('File Operations', () => {
  const testDir = join(tmpdir(), 'file-operations-test', Date.now().toString());

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 정리 실패는 무시
    }
  });

  describe('atomicWrite', () => {
    test('파일 원자적 쓰기', async () => {
      const filePath = join(testDir, 'atomic-test.txt');
      const content = 'Test content for atomic write';

      await atomicWrite(filePath, content);

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(content);
    });

    test('기존 파일 덮어쓰기', async () => {
      const filePath = join(testDir, 'overwrite-test.txt');
      
      await fs.writeFile(filePath, 'Original content');
      await atomicWrite(filePath, 'New content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('New content');
    });

    test('디렉토리 자동 생성', async () => {
      const filePath = join(testDir, 'nested', 'deep', 'file.txt');
      const content = 'Test content';

      await atomicWrite(filePath, content, { createDirs: true });

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe(content);
    });
  });

  describe('safeRead', () => {
    test('파일 안전 읽기', async () => {
      const filePath = join(testDir, 'read-test.txt');
      const content = 'Test content for safe read';

      await fs.writeFile(filePath, content);
      const read = await safeRead(filePath);

      expect(read).toBe(content);
    });

    test('존재하지 않는 파일 읽기', async () => {
      const filePath = join(testDir, 'non-existent.txt');

      await expect(safeRead(filePath)).rejects.toThrow();
    });

    test('인코딩 옵션', async () => {
      const filePath = join(testDir, 'encoding-test.txt');
      const content = 'Test content with encoding';

      await fs.writeFile(filePath, content, 'utf-8');
      const read = await safeRead(filePath, { encoding: 'utf-8' });

      expect(read).toBe(content);
    });
  });

  describe('ensureDirectory', () => {
    test('디렉토리 생성', async () => {
      const dirPath = join(testDir, 'ensure-test');

      await ensureDirectory(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('이미 존재하는 디렉토리', async () => {
      const dirPath = join(testDir, 'existing-dir');
      
      await fs.mkdir(dirPath);
      await ensureDirectory(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    test('중첩된 디렉토리 생성', async () => {
      const dirPath = join(testDir, 'nested', 'deep', 'directory');

      await ensureDirectory(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('getFileInfo', () => {
    test('파일 정보 가져오기', async () => {
      const filePath = join(testDir, 'info-test.txt');
      const content = 'Test content for file info';

      await fs.writeFile(filePath, content);
      const info = await getFileInfo(filePath);

      expect(info.path).toBe(filePath);
      expect(info.size).toBe(Buffer.byteLength(content));
      expect(info.isFile).toBe(true);
      expect(info.isDirectory).toBe(false);
      expect(info.created).toBeInstanceOf(Date);
      expect(info.modified).toBeInstanceOf(Date);
    });

    test('디렉토리 정보 가져오기', async () => {
      const dirPath = join(testDir, 'info-dir-test');
      
      await fs.mkdir(dirPath);
      const info = await getFileInfo(dirPath);

      expect(info.path).toBe(dirPath);
      expect(info.isFile).toBe(false);
      expect(info.isDirectory).toBe(true);
    });
  });

  describe('listMarkdownFiles', () => {
    beforeAll(async () => {
      const markdownDir = join(testDir, 'markdown-files');
      await fs.mkdir(markdownDir, { recursive: true });

      // 테스트 파일들 생성
      await fs.writeFile(join(markdownDir, 'note1.md'), '# Note 1');
      await fs.writeFile(join(markdownDir, 'note2.md'), '# Note 2');
      await fs.writeFile(join(markdownDir, 'README.txt'), 'Not markdown');
      await fs.writeFile(join(markdownDir, 'note3.markdown'), '# Note 3');

      // 하위 디렉토리
      const subDir = join(markdownDir, 'subdirectory');
      await fs.mkdir(subDir);
      await fs.writeFile(join(subDir, 'subnote.md'), '# Sub Note');
    });

    test('마크다운 파일 목록 가져오기', async () => {
      const markdownDir = join(testDir, 'markdown-files');
      const files = await listMarkdownFiles(markdownDir);

      const filenames = files.map(f => f.name);
      expect(filenames).toContain('note1.md');
      expect(filenames).toContain('note2.md');
      expect(filenames).toContain('note3.markdown');
      expect(filenames).not.toContain('README.txt');
    });

    test('재귀적 마크다운 파일 목록', async () => {
      const markdownDir = join(testDir, 'markdown-files');
      const files = await listMarkdownFiles(markdownDir, { recursive: true });

      const filenames = files.map(f => f.name);
      expect(filenames).toContain('subnote.md');
    });

    test('패턴 필터링', async () => {
      const markdownDir = join(testDir, 'markdown-files');
      const files = await listMarkdownFiles(markdownDir, {
        pattern: /^note\d+\.md$/
      });

      expect(files).toHaveLength(2);
      expect(files.map(f => f.name)).toEqual(
        expect.arrayContaining(['note1.md', 'note2.md'])
      );
    });
  });
});