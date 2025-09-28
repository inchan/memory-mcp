/**
 * VaultWatcher 테스트
 */

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { VaultWatcher } from '../watcher';
import { FileWatchEventData, FileWatchEvent } from '../types';
import { MarkdownNote } from '@memory-mcp/common';

// Mock chokidar
const mockWatcher = {
  on: jest.fn(),
  close: jest.fn(),
  add: jest.fn(),
  unwatch: jest.fn(),
  getWatched: jest.fn(() => ({})),
};

jest.mock('chokidar', () => ({
  watch: jest.fn(() => mockWatcher),
}));

// Mock dependencies
jest.mock('../file-operations');
jest.mock('../note-manager');
jest.mock('../git-snapshot');
jest.mock('@memory-mcp/common', () => ({
  debounce: jest.fn((fn, delay) => {
    const debouncedFn = jest.fn(fn);
    (debouncedFn as any).cancel = jest.fn();
    return debouncedFn;
  }),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import chokidar from 'chokidar';
import * as noteManager from '../note-manager';
import { GitSnapshotManager } from '../git-snapshot';

// 임시 테스트 디렉토리
const TEMP_DIR = path.join(__dirname, '../../temp-watcher-test');

describe('VaultWatcher', () => {
  let watcher: VaultWatcher;
  let mockGitSnapshot: GitSnapshotManager;

  beforeEach(async () => {
    // 임시 디렉토리 생성
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Mock clear
    jest.clearAllMocks();
    mockWatcher.on.mockClear();
    mockWatcher.close.mockClear();

    // Mock GitSnapshotManager
    mockGitSnapshot = {
      createSnapshot: jest.fn(),
    } as any;

    // Mock implementations
    (noteManager.loadNote as jest.Mock).mockClear();
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }

    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // 무시 - 테스트 디렉토리가 없을 수 있음
    }
  });

  describe('생성자 및 기본 설정', () => {
    test('기본 옵션으로 VaultWatcher 생성', () => {
      watcher = new VaultWatcher(TEMP_DIR);

      expect(watcher).toBeInstanceOf(VaultWatcher);
      expect(watcher).toBeInstanceOf(EventEmitter);
    });

    test('커스텀 옵션으로 VaultWatcher 생성', () => {
      const options = {
        pattern: '**/*.txt',
        ignored: ['**/temp/**'],
        debounceMs: 500,
        recursive: false,
        gitSnapshot: mockGitSnapshot
      };

      watcher = new VaultWatcher(TEMP_DIR, options);

      expect(watcher).toBeInstanceOf(VaultWatcher);
    });
  });

  describe('파일 감시 시작 및 중지', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR);
    });

    test('파일 감시 시작', async () => {
      await watcher.start();

      expect(chokidar.watch).toHaveBeenCalledWith(TEMP_DIR, {
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.*',
          '**/*.tmp',
          '**/*.temp'
        ],
        ignoreInitial: true,
        persistent: true,
        followSymlinks: false,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100
        }
      });

      expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('이미 시작된 상태에서 재시작', async () => {
      await watcher.start();
      await watcher.start(); // 두 번째 호출

      expect(chokidar.watch).toHaveBeenCalledTimes(1); // 한 번만 호출됨
    });

    test('파일 감시 중지', async () => {
      await watcher.start();
      await watcher.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    test('시작되지 않은 상태에서 중지', async () => {
      // 에러 없이 실행되어야 함
      await expect(watcher.stop()).resolves.toBeUndefined();
    });
  });

  describe('파일 이벤트 처리', () => {
    let fileHandler: (filePath: string) => void;
    let unlinkHandler: (filePath: string) => void;

    beforeEach(async () => {
      watcher = new VaultWatcher(TEMP_DIR);
      await watcher.start();

      // 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const addCall = calls.find(call => call[0] === 'add');
      const changeCall = calls.find(call => call[0] === 'change');
      const unlinkCall = calls.find(call => call[0] === 'unlink');

      fileHandler = addCall?.[1] || changeCall?.[1];
      unlinkHandler = unlinkCall?.[1];
    });

    test('마크다운 파일 추가 이벤트 처리', async () => {
      const mockNote: MarkdownNote = {
        filePath: path.join(TEMP_DIR, 'test.md'),
        frontMatter: {
          id: 'test-id',
          title: 'Test Note',
          category: 'Resources' as const,
          tags: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          links: []
        },
        content: 'Test content',
        metadata: {
          size: 100,
          created: new Date(),
          modified: new Date(),
          hash: 'test-hash'
        }
      };

      (noteManager.loadNote as jest.Mock).mockResolvedValue(mockNote);

      const eventPromise = new Promise<FileWatchEventData>((resolve) => {
        watcher.once('fileChange', resolve);
      });

      fileHandler(path.join(TEMP_DIR, 'test.md'));

      const eventData = await eventPromise;

      expect(eventData.type).toBe('add');
      expect(eventData.filePath).toBe(path.join(TEMP_DIR, 'test.md'));
      expect(eventData.note).toEqual(mockNote);
      expect(noteManager.loadNote).toHaveBeenCalledWith(
        path.join(TEMP_DIR, 'test.md'),
        { validateFrontMatter: false }
      );
    });

    test('마크다운이 아닌 파일은 무시', async () => {
      let eventFired = false;
      watcher.once('fileChange', () => { eventFired = true; });

      fileHandler(path.join(TEMP_DIR, 'test.txt'));

      // 이벤트가 발생하지 않을 때까지 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(eventFired).toBe(false);
      expect(noteManager.loadNote).not.toHaveBeenCalled();
    });

    test('파일 삭제 이벤트 처리', async () => {
      const eventPromise = new Promise<FileWatchEventData>((resolve) => {
        watcher.once('fileChange', resolve);
      });

      unlinkHandler(path.join(TEMP_DIR, 'deleted.md'));

      const eventData = await eventPromise;

      expect(eventData.type).toBe('unlink');
      expect(eventData.filePath).toBe(path.join(TEMP_DIR, 'deleted.md'));
      expect(eventData.note).toBeUndefined();
    });

    test('노트 로드 실패 시 에러 이벤트 발생', async () => {
      (noteManager.loadNote as jest.Mock).mockRejectedValue(new Error('파일 읽기 실패'));

      const errorPromise = new Promise<Error>((resolve) => {
        watcher.once('error', resolve);
      });

      fileHandler(path.join(TEMP_DIR, 'broken.md'));

      const error = await errorPromise;

      expect(error.message).toContain('파일 읽기 실패');
    });
  });

  describe('Git 스냅샷 통합', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR, {
        gitSnapshot: mockGitSnapshot
      });
    });

    test('파일 변경 시 Git 스냅샷 생성', async () => {
      const mockNote: MarkdownNote = {
        filePath: path.join(TEMP_DIR, 'test.md'),
        frontMatter: {
          id: 'test-id',
          title: 'Test Note',
          category: 'Resources' as const,
          tags: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          links: []
        },
        content: 'Test content',
        metadata: {
          size: 100,
          created: new Date(),
          modified: new Date(),
          hash: 'test-hash'
        }
      };

      (noteManager.loadNote as jest.Mock).mockResolvedValue(mockNote);
      (mockGitSnapshot.createSnapshot as jest.Mock).mockResolvedValue({
        success: true,
        commitSha: 'abc123'
      });

      await watcher.start();

      // 파일 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const changeCall = calls.find(call => call[0] === 'change');
      const fileHandler = changeCall?.[1];

      if (fileHandler) {
        fileHandler(path.join(TEMP_DIR, 'test.md'));

        // Git 스냅샷이 호출될 때까지 대기
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockGitSnapshot.createSnapshot).toHaveBeenCalled();
      }
    });

    test('Git 스냅샷 실패 시 에러 처리', async () => {
      const mockNote: MarkdownNote = {
        filePath: path.join(TEMP_DIR, 'test.md'),
        frontMatter: {
          id: 'test-id',
          title: 'Test Note',
          category: 'Resources' as const,
          tags: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          links: []
        },
        content: 'Test content',
        metadata: {
          size: 100,
          created: new Date(),
          modified: new Date(),
          hash: 'test-hash'
        }
      };

      (noteManager.loadNote as jest.Mock).mockResolvedValue(mockNote);
      (mockGitSnapshot.createSnapshot as jest.Mock).mockRejectedValue(
        new Error('Git 스냅샷 실패')
      );

      const errorPromise = new Promise<Error>((resolve) => {
        watcher.once('error', resolve);
      });

      await watcher.start();

      // 파일 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const changeCall = calls.find(call => call[0] === 'change');
      const fileHandler = changeCall?.[1];

      if (fileHandler) {
        fileHandler(path.join(TEMP_DIR, 'test.md'));

        const error = await errorPromise;
        expect(error.message).toContain('Git 스냅샷 실패');
      }
    });
  });

  describe('이벤트 핸들러 등록', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR);
    });

    test('onFileChange 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = watcher.onFileChange(handler);

      expect(result).toBe(watcher); // 체이닝 확인

      const eventData: FileWatchEventData = {
        type: 'change',
        filePath: '/test.md'
      };

      watcher.emit('fileChange', eventData);

      expect(handler).toHaveBeenCalledWith(eventData);
    });

    test('onError 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = watcher.onError(handler);

      expect(result).toBe(watcher); // 체이닝 확인

      watcher.emit('error', new Error('테스트 에러'));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('디바운스 처리', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR, {
        debounceMs: 100
      });
    });

    test('짧은 시간 내 연속 이벤트는 디바운스됨', async () => {
      const mockNote: MarkdownNote = {
        filePath: path.join(TEMP_DIR, 'test.md'),
        frontMatter: {
          id: 'test-id',
          title: 'Test Note',
          category: 'Resources' as const,
          tags: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          links: []
        },
        content: 'Test content',
        metadata: {
          size: 100,
          created: new Date(),
          modified: new Date(),
          hash: 'test-hash'
        }
      };

      (noteManager.loadNote as jest.Mock).mockResolvedValue(mockNote);

      await watcher.start();

      const eventHandler = jest.fn();
      watcher.onFileChange(eventHandler);

      // 파일 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const changeCall = calls.find(call => call[0] === 'change');
      const fileHandler = changeCall?.[1];

      if (fileHandler) {
        // 연속으로 여러 번 호출
        fileHandler(path.join(TEMP_DIR, 'test.md'));
        fileHandler(path.join(TEMP_DIR, 'test.md'));
        fileHandler(path.join(TEMP_DIR, 'test.md'));

        // 디바운스 시간 대기
        await new Promise(resolve => setTimeout(resolve, 150));

        // 디바운스로 인해 한 번만 실행되어야 함
        expect(eventHandler).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('상태 확인', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR);
    });

    test('감시 상태 확인 - 시작 전', () => {
      expect(watcher.isWatching).toBe(false);
    });

    test('감시 상태 확인 - 시작 후', async () => {
      await watcher.start();
      expect(watcher.isWatching).toBe(true);
    });

    test('감시 상태 확인 - 중지 후', async () => {
      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching).toBe(false);
    });
  });

  describe('에러 핸들링', () => {
    beforeEach(() => {
      watcher = new VaultWatcher(TEMP_DIR);
    });

    test('chokidar 에러 이벤트 처리', async () => {
      await watcher.start();

      const errorPromise = new Promise<Error>((resolve) => {
        watcher.once('error', resolve);
      });

      // chokidar 에러 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const errorCall = calls.find(call => call[0] === 'error');
      const errorHandler = errorCall?.[1];

      if (errorHandler) {
        const chokidarError = new Error('chokidar 에러');
        errorHandler(chokidarError);

        const error = await errorPromise;
        expect(error).toBe(chokidarError);
      }
    });
  });

  describe('경로 필터링', () => {
    test('무시할 패턴의 파일은 처리하지 않음', async () => {
      watcher = new VaultWatcher(TEMP_DIR, {
        ignored: ['**/temp/**', '**/*.tmp']
      });

      await watcher.start();

      let eventFired = false;
      watcher.once('fileChange', () => { eventFired = true; });

      // 파일 이벤트 핸들러 캡처
      const calls = mockWatcher.on.mock.calls;
      const addCall = calls.find(call => call[0] === 'add');
      const fileHandler = addCall?.[1];

      if (fileHandler) {
        // 무시할 패턴의 파일들
        fileHandler(path.join(TEMP_DIR, 'temp', 'test.md'));
        fileHandler(path.join(TEMP_DIR, 'test.tmp'));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(eventFired).toBe(false);
      }
    });
  });
});