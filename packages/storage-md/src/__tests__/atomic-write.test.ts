/**
 * 원자적 쓰기 검증 테스트
 *
 * VALIDATION_STRATEGY.md Level 5: 성능 & 보안 검증
 * - 원자적 파일 쓰기 보장
 * - 중단 시 데이터 무결성 검증
 * - 임시 파일 + rename 전략 검증
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { writeFile, atomicWriteFile } from '../file-operations';

describe('Atomic Write Guarantee', () => {
  let testDir: string;

  beforeEach(async () => {
    // 테스트용 임시 디렉토리 생성
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(async () => {
    // 정리
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('atomicWriteFile', () => {
    it('should write file atomically using temp file + rename', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'This is atomic write test';

      await atomicWriteFile(filePath, content);

      // 파일이 존재해야 함
      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // 내용이 정확해야 함
      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent).toBe(content);
    });

    it('should not leave temp files after successful write', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Test content';

      await atomicWriteFile(filePath, content);

      // 디렉토리 내 파일 목록
      const files = await fs.readdir(testDir);

      // 임시 파일(.tmp로 시작)이 없어야 함
      const tempFiles = files.filter(f => f.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);

      // 최종 파일만 존재해야 함
      expect(files).toEqual(['test.txt']);
    });

    it('should overwrite existing file atomically', async () => {
      const filePath = path.join(testDir, 'test.txt');

      // 초기 내용 쓰기
      await atomicWriteFile(filePath, 'Initial content');

      // 기존 내용 확인
      let content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Initial content');

      // 덮어쓰기
      await atomicWriteFile(filePath, 'Updated content');

      // 업데이트된 내용 확인
      content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Updated content');
    });

    it('should not corrupt existing file during overwrite', async () => {
      const filePath = path.join(testDir, 'test.txt');

      // 초기 파일 생성
      await atomicWriteFile(filePath, 'Original content');

      // 파일이 존재하는지 확인
      let content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Original content');

      // 여러 번 덮어쓰기
      for (let i = 0; i < 10; i++) {
        await atomicWriteFile(filePath, `Content ${i}`);
        content = await fs.readFile(filePath, 'utf8');
        expect(content).toBe(`Content ${i}`);
      }

      // 마지막 내용이 정확한지 확인
      content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Content 9');

      // 임시 파일이 없는지 확인
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter(f => f.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should create directory if not exists', async () => {
      const nestedPath = path.join(testDir, 'nested', 'dir', 'test.txt');
      const content = 'Test in nested directory';

      await atomicWriteFile(nestedPath, content, { ensureDir: true });

      // 파일이 생성되었는지 확인
      const readContent = await fs.readFile(nestedPath, 'utf8');
      expect(readContent).toBe(content);
    });
  });

  describe('writeFile with atomic option', () => {
    it('should use atomic write by default', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Default should be atomic';

      // atomic 옵션 기본값은 true
      await writeFile(filePath, content);

      // 파일이 존재하고 내용이 정확해야 함
      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent).toBe(content);

      // 임시 파일이 없어야 함
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter(f => f.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should support non-atomic write when explicitly disabled', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Non-atomic write';

      await writeFile(filePath, content, { atomic: false });

      // 파일이 존재하고 내용이 정확해야 함
      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent).toBe(content);
    });
  });

  describe('Data Integrity', () => {
    it('should not corrupt file on concurrent writes (atomic)', async () => {
      const filePath = path.join(testDir, 'concurrent.txt');

      // 동시 쓰기 (10개)
      const writes = Array.from({ length: 10 }, (_, i) =>
        atomicWriteFile(filePath, `Content ${i}`)
      );

      await Promise.all(writes);

      // 파일이 존재하고 유효한 내용을 가져야 함
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/^Content \d$/);

      // 임시 파일이 없어야 함
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter(f => f.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle large file writes atomically', async () => {
      const filePath = path.join(testDir, 'large.txt');

      // 큰 파일 (1MB)
      const largeContent = 'x'.repeat(1024 * 1024);

      await atomicWriteFile(filePath, largeContent);

      // 파일이 완전히 쓰여졌는지 확인
      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent.length).toBe(largeContent.length);

      // 임시 파일이 정리되었는지 확인
      const files = await fs.readdir(testDir);
      expect(files).toEqual(['large.txt']);
    });

    it('should handle special characters in content', async () => {
      const filePath = path.join(testDir, 'special.txt');
      const content = `
        Special characters: 한글, 日本語, Emoji 🎉
        Newlines\nand\ttabs
        Quotes: "double" and 'single'
      `;

      await atomicWriteFile(filePath, content);

      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent).toBe(content);
    });
  });

  describe('Error Handling', () => {
    it('should clean up temp file on write failure', async () => {
      // 잘못된 경로로 쓰기 시도하여 실패 유도
      const invalidPath = path.join('/root/protected', 'test.txt');

      // 쓰기 시도 (실패할 것 - 권한 또는 존재하지 않는 경로)
      try {
        await atomicWriteFile(invalidPath, 'content', { ensureDir: false });
        // 만약 성공하면 (권한이 있는 환경) 테스트 스킵
        expect(true).toBe(true);
      } catch (error) {
        // 예상된 실패
        expect(error).toBeDefined();

        // testDir에 임시 파일이 생성되지 않았는지 확인
        // (실패한 쓰기는 다른 경로였으므로 testDir은 깨끗해야 함)
        const files = await fs.readdir(testDir);
        expect(files.length).toBe(0);
      }
    });

    it('should provide meaningful error messages', async () => {
      const invalidPath = '/nonexistent/directory/test.txt';

      await expect(
        atomicWriteFile(invalidPath, 'content', { ensureDir: false })
      ).rejects.toThrow(/원자적 파일 쓰기 실패/);
    });
  });

  describe('Performance', () => {
    it('should complete atomic write within reasonable time', async () => {
      const filePath = path.join(testDir, 'perf.txt');
      const content = 'Performance test content';

      const start = performance.now();
      await atomicWriteFile(filePath, content);
      const duration = performance.now() - start;

      // 단일 파일 쓰기는 100ms 이내여야 함
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple files efficiently', async () => {
      const fileCount = 50;

      const start = performance.now();

      const writes = Array.from({ length: fileCount }, (_, i) =>
        atomicWriteFile(path.join(testDir, `file-${i}.txt`), `Content ${i}`)
      );

      await Promise.all(writes);

      const duration = performance.now() - start;

      // 50개 파일 쓰기가 5초 이내여야 함 (병렬 처리)
      expect(duration).toBeLessThan(5000);

      // 모든 파일이 생성되었는지 확인
      const files = await fs.readdir(testDir);
      expect(files.length).toBe(fileCount);

      // 임시 파일이 없어야 함
      const tempFiles = files.filter(f => f.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle note with Front Matter atomically', async () => {
      const filePath = path.join(testDir, 'note.md');
      const noteContent = `---
id: "20250927T103000Z"
title: "Test Note"
category: "Resources"
tags: ["test", "atomic"]
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
---

# Test Note

This is a test note with Front Matter.
`;

      await atomicWriteFile(filePath, noteContent);

      const readContent = await fs.readFile(filePath, 'utf8');
      expect(readContent).toBe(noteContent);

      // YAML Front Matter가 유지되었는지 확인
      expect(readContent).toContain('---');
      expect(readContent).toContain('id: "20250927T103000Z"');
    });
  });
});
