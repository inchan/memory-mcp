/**
 * Storage-md 패키지 기본 기능 테스트
 */

import {
  loadNote,
  saveNote,
  createNewNote,
  parseFrontMatter,
  createVaultWatcher,
  PACKAGE_VERSION,
  GitSnapshotManager
} from '../index';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Storage-md Package', () => {
  const testDir = join(tmpdir(), 'storage-md-test', Date.now().toString());

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

  test('패키지 버전이 정의되어 있어야 함', () => {
    expect(PACKAGE_VERSION).toBe('0.1.0');
  });

  test('새 노트 생성', () => {
    const testFilePath = join(testDir, 'test-note.md');
    const note = createNewNote(
      'Test Note',
      'This is test content',
      testFilePath,
      'Resources'
    );

    expect(note.frontMatter.title).toBe('Test Note');
    expect(note.frontMatter.category).toBe('Resources');
    expect(note.content).toBe('This is test content');
    expect(note.filePath).toBe(testFilePath);
    expect(note.frontMatter.id).toMatch(/^\d{8}T\d{12}Z$/);
  });

  test('Front Matter 파싱', () => {
    const content = `---
id: "20250927T103000123456Z"
title: "Test Note"
category: "Resources"
tags: ["test", "example"]
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
links: []
---

# Test Content

This is a test note.`;

    const result = parseFrontMatter(content);

    expect(result.frontMatter.title).toBe('Test Note');
    expect(result.frontMatter.category).toBe('Resources');
    expect(result.frontMatter.tags).toEqual(['test', 'example']);
    expect(result.content.trim()).toBe('# Test Content\n\nThis is a test note.');
  });

  test('노트 저장 및 로드', async () => {
    const testFilePath = join(testDir, 'save-load-test.md');

    // 새 노트 생성
    const originalNote = createNewNote(
      'Save Load Test',
      '# Test\n\nThis is a save/load test.',
      testFilePath,
      'Projects'
    );

    // 노트 저장
    await saveNote(originalNote);

    // 파일이 생성되었는지 확인
    const stats = await fs.stat(testFilePath);
    expect(stats.isFile()).toBe(true);

    // 노트 로드
    const loadedNote = await loadNote(testFilePath);

    // 내용 비교
    expect(loadedNote.frontMatter.title).toBe(originalNote.frontMatter.title);
    expect(loadedNote.frontMatter.category).toBe(originalNote.frontMatter.category);
    expect(loadedNote.content).toBe(originalNote.content);
    expect(loadedNote.filePath).toBe(originalNote.filePath);
  });

  test('볼트 감시자 생성', () => {
    const watcher = createVaultWatcher(testDir, {
      debounceMs: 100,
      recursive: true
    });

    expect(watcher).toBeDefined();
    expect(watcher.watching).toBe(false);
  });

  test('잘못된 Front Matter 처리', () => {
    const invalidContent = `---
invalid: yaml: content:
title: "Missing quotes
---

Content here`;

    expect(() => {
      parseFrontMatter(invalidContent, 'test.md', true);
    }).toThrow();

    // 비엄격 모드에서는 기본값으로 처리
    const result = parseFrontMatter(invalidContent, 'test.md', false);
    expect(result.frontMatter.title).toBe('Untitled');
    expect(result.frontMatter.category).toBe('Resources');
  });
});

describe('GitSnapshotManager', () => {
  const testRoot = join(tmpdir(), 'storage-md-git', Date.now().toString());
  let repoDir: string;

  beforeEach(async () => {
    repoDir = join(testRoot, `repo-${Date.now()}`);
    await fs.mkdir(repoDir, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  });

  afterAll(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  test('파일 변경을 스냅샷 커밋으로 기록', async () => {
    const manager = new GitSnapshotManager(repoDir, {
      mode: 'commit',
      commitMessageTemplate: 'snapshot: {count} files'
    });

    await manager.initialize();

    const filePath = join(repoDir, 'Projects', 'note.md');
    await fs.mkdir(join(repoDir, 'Projects'), { recursive: true });
    await fs.writeFile(filePath, '# Hello world');

    const result = await manager.createSnapshot([
      {
        type: 'add',
        filePath,
      }
    ]);

    expect(result?.success).toBe(true);
    expect(result?.mode).toBe('commit');
    expect(result?.changedFiles).toContain('Projects/note.md');

    const log = await execFileAsync('git', ['log', '-1', '--pretty=%B'], { cwd: repoDir });
    expect(log.stdout.trim()).toBe('snapshot: 1 files');

    const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir });
    expect(status.stdout.trim()).toBe('');
  });

  test('파일 삭제를 스냅샷에 포함', async () => {
    const filePath = join(repoDir, 'note.md');
    await fs.writeFile(filePath, '# Temp');
    await execFileAsync('git', ['add', 'note.md'], { cwd: repoDir });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

    const manager = new GitSnapshotManager(repoDir, {
      mode: 'commit',
    });
    await manager.initialize();

    await fs.unlink(filePath);

    const result = await manager.createSnapshot([
      {
        type: 'unlink',
        filePath,
      }
    ]);

    expect(result?.success).toBe(true);
    expect(result?.changedFiles).toContain('note.md');

    const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir });
    expect(status.stdout.trim()).toBe('');
  });

  test('비활성화 모드에서는 커밋하지 않음', async () => {
    const manager = new GitSnapshotManager(repoDir, {
      mode: 'disabled'
    });
    await manager.initialize();

    const filePath = join(repoDir, 'note.md');
    await fs.writeFile(filePath, '# No snapshot');

    const result = await manager.createSnapshot([
      {
        type: 'change',
        filePath,
      }
    ]);

    expect(result).toBeNull();

    const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir });
    expect(status.stdout).toContain('?? note.md');

    await expect(
      execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repoDir })
    ).rejects.toHaveProperty('code');
  });
});

describe('Integration Tests', () => {
  const testDir = join(tmpdir(), 'storage-md-integration', Date.now().toString());

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

  test('복합 워크플로우: 생성 → 저장 → 로드 → 수정 → 저장', async () => {
    const testFilePath = join(testDir, 'workflow-test.md');

    // 1. 새 노트 생성
    let note = createNewNote(
      'Workflow Test',
      '# Initial Content\n\nOriginal content.',
      testFilePath,
      'Areas'
    );

    // 2. 저장
    await saveNote(note);

    // 3. 로드
    note = await loadNote(testFilePath);
    expect(note.frontMatter.title).toBe('Workflow Test');

    // 4. 수정
    note.content = '# Updated Content\n\nModified content.';
    note.frontMatter.tags = ['updated', 'test'];

    // 5. 다시 저장
    await saveNote(note);

    // 6. 다시 로드하여 확인
    const finalNote = await loadNote(testFilePath);
    expect(finalNote.content).toBe('# Updated Content\n\nModified content.');
    expect(finalNote.frontMatter.tags).toEqual(['updated', 'test']);
    expect(finalNote.frontMatter.updated).not.toBe(finalNote.frontMatter.created);
  });
});