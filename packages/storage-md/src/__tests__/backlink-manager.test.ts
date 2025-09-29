/**
 * BacklinkManager 테스트
 */

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { BacklinkManager, createBacklinkManager } from '../backlink-manager';
import { VaultWatcher } from '../watcher';
import { FileWatchEventData } from '../types';
import { MarkdownNote } from '@memory-mcp/common';

// Mock dependencies
jest.mock('../note-manager');
jest.mock('../front-matter');
jest.mock('@memory-mcp/common', () => {
  const debounce = (fn: (...args: any[]) => any) => {
    const wrapper = (...args: any[]) => {
      (wrapper as any).lastArgs = args;
    };

    (wrapper as any).cancel = jest.fn();
    (wrapper as any).runNow = () => fn(...(((wrapper as any).lastArgs as any[]) ?? []));

    return wrapper;
  };

  return {
    __esModule: true,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    debounce: jest.fn(debounce),
  };
});

import * as noteManager from '../note-manager';
import * as frontMatter from '../front-matter';

// 임시 테스트 디렉토리
const TEST_VAULT_PATH = path.join(__dirname, '../../test-vault');
const TEMP_DIR = path.join(__dirname, '../../temp-test');

describe('BacklinkManager', () => {
  let manager: BacklinkManager;
  let mockWatcher: VaultWatcher;

  beforeEach(async () => {
    // 임시 디렉토리 생성
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Mock VaultWatcher
    mockWatcher = new EventEmitter() as any;
    mockWatcher.onFileChange = jest.fn((handler) => {
      mockWatcher.on('fileChange', handler);
    });

    // Mock implementations
    (noteManager.findNoteByUid as jest.Mock).mockClear();
    (noteManager.analyzeLinks as jest.Mock).mockClear();
    (noteManager.saveNote as jest.Mock).mockClear();
    (noteManager.loadNote as jest.Mock).mockClear();
    (frontMatter.updateFrontMatter as jest.Mock).mockClear();
    jest.clearAllMocks();

    manager = new BacklinkManager(TEMP_DIR);
  });

  afterEach(async () => {
    // 정리
    if (manager) {
      await manager.cleanup();
    }

    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // 무시 - 테스트 디렉토리가 없을 수 있음
    }
  });

  describe('생성자 및 초기화', () => {
    test('기본 옵션으로 BacklinkManager 생성', () => {
      const manager = new BacklinkManager(TEST_VAULT_PATH);

      expect(manager).toBeInstanceOf(BacklinkManager);
      expect(manager.syncStats.isInitialized).toBe(false);
      expect(manager.syncStats.autoSync).toBe(true);
      expect(manager.syncStats.pendingUpdates).toBe(0);
    });

    test('커스텀 옵션으로 BacklinkManager 생성', () => {
      const options = {
        autoSync: false,
        debounceMs: 2000,
        batchSize: 20,
        concurrency: 10,
      };

      const manager = new BacklinkManager(TEST_VAULT_PATH, options);

      expect(manager.syncStats.autoSync).toBe(false);
    });

    test('팩토리 함수로 BacklinkManager 생성', () => {
      const manager = createBacklinkManager(TEST_VAULT_PATH);

      expect(manager).toBeInstanceOf(BacklinkManager);
    });
  });

  describe('초기화 및 정리', () => {
    test('watcher 없이 초기화', async () => {
      await manager.initialize();

      expect(manager.syncStats.isInitialized).toBe(true);
    });

    test('watcher와 함께 초기화', async () => {
      await manager.initialize(mockWatcher);

      expect(manager.syncStats.isInitialized).toBe(true);
      expect(mockWatcher.onFileChange).toHaveBeenCalled();
    });

    test('이미 초기화된 상태에서 재초기화', async () => {
      await manager.initialize();
      const firstInitTime = manager.syncStats.isInitialized;

      await manager.initialize();

      expect(manager.syncStats.isInitialized).toBe(firstInitTime);
    });

    test('autoSync가 false인 경우 watcher 등록하지 않음', async () => {
      const managerNoSync = new BacklinkManager(TEMP_DIR, { autoSync: false });

      await managerNoSync.initialize(mockWatcher);

      expect(mockWatcher.onFileChange).not.toHaveBeenCalled();

      await managerNoSync.cleanup();
    });

    test('cleanup 실행', async () => {
      await manager.initialize();
      expect(manager.syncStats.isInitialized).toBe(true);

      await manager.cleanup();

      expect(manager.syncStats.isInitialized).toBe(false);
      expect(manager.syncStats.pendingUpdates).toBe(0);
    });

    test('초기화되지 않은 상태에서 cleanup 실행', async () => {
      // 에러 없이 실행되어야 함
      await expect(manager.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('백링크 동기화', () => {
    const mockNote: MarkdownNote = {
      filePath: '/test/note.md',
      frontMatter: {
        id: 'test-note-id',
        title: 'Test Note',
        category: 'Resources' as const,
        tags: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        links: ['old-link-1', 'old-link-2']
      },
      content: 'Test content with [[new-link]] and [[another-link]]',
      metadata: {
        size: 100,
        created: new Date(),
        modified: new Date(),
        hash: 'test-hash'
      }
    };

    beforeEach(async () => {
      await manager.initialize();
    });

    test('특정 노트의 백링크 동기화', async () => {
      const linkAnalysis = {
        outboundLinks: ['new-link', 'another-link'],
        inboundLinks: [],
        brokenLinks: []
      };

      (noteManager.findNoteByUid as jest.Mock).mockResolvedValue(mockNote);
      (noteManager.analyzeLinks as jest.Mock).mockResolvedValue(linkAnalysis);
      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...mockNote.frontMatter,
        links: linkAnalysis.outboundLinks
      });
      (noteManager.saveNote as jest.Mock).mockResolvedValue(undefined);

      await manager.syncBacklinksForNote('test-note-id');

      expect(noteManager.findNoteByUid).toHaveBeenCalledWith('test-note-id', TEMP_DIR);
      expect(noteManager.analyzeLinks).toHaveBeenCalledWith(mockNote, TEMP_DIR);
      expect(frontMatter.updateFrontMatter).toHaveBeenCalled();
      expect(noteManager.saveNote).toHaveBeenCalled();
    });

    test('존재하지 않는 노트의 백링크 동기화', async () => {
      (noteManager.findNoteByUid as jest.Mock).mockResolvedValue(null);

      await manager.syncBacklinksForNote('non-existent-id');

      expect(noteManager.findNoteByUid).toHaveBeenCalledWith('non-existent-id', TEMP_DIR);
      expect(noteManager.analyzeLinks).not.toHaveBeenCalled();
    });

    test('링크 변경사항이 없는 경우', async () => {
      const linkAnalysis = {
        outboundLinks: ['old-link-1', 'old-link-2'], // 기존과 동일
        inboundLinks: [],
        brokenLinks: []
      };

      (noteManager.findNoteByUid as jest.Mock).mockResolvedValue(mockNote);
      (noteManager.analyzeLinks as jest.Mock).mockResolvedValue(linkAnalysis);
      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...mockNote.frontMatter,
        links: linkAnalysis.outboundLinks
      });

      await manager.syncBacklinksForNote('test-note-id');

      expect(noteManager.saveNote).not.toHaveBeenCalled(); // 변경사항이 없으므로 저장하지 않음
    });

    test('백링크 동기화 에러 처리', async () => {
      (noteManager.findNoteByUid as jest.Mock).mockRejectedValue(new Error('DB 에러'));

      await expect(manager.syncBacklinksForNote('test-note-id')).rejects.toThrow('백링크 동기화 실패');
    });
  });

  describe('전체 백링크 재빌드', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('전체 백링크 재빌드', async () => {
      const mockFiles = ['/vault/note1.md', '/vault/note2.md'];

      const listSpy = jest
        .spyOn(manager as any, 'listMarkdownFiles')
        .mockResolvedValue(mockFiles);

      (noteManager.loadNote as jest.Mock)
        .mockResolvedValueOnce({ frontMatter: { id: 'note1' } })
        .mockResolvedValueOnce({ frontMatter: { id: 'note2' } });

      const syncSpy = jest
        .spyOn(manager, 'syncBacklinksForNote')
        .mockResolvedValue();

      await expect(manager.rebuildAllBacklinks()).resolves.toBeUndefined();

      expect(manager.syncBacklinksForNote).toHaveBeenCalledTimes(2);
      syncSpy.mockRestore();
      listSpy.mockRestore();
    });

    test('파일 로드 실패 시 건너뛰기', async () => {
      const mockFiles = ['/vault/note1.md', '/vault/note2.md'];

      const listSpy = jest
        .spyOn(manager as any, 'listMarkdownFiles')
        .mockResolvedValue(mockFiles);
      (noteManager.loadNote as jest.Mock)
        .mockResolvedValueOnce({ frontMatter: { id: 'note1' } })
        .mockRejectedValueOnce(new Error('파일 읽기 실패'));

      await expect(manager.rebuildAllBacklinks()).resolves.toBeUndefined();

      expect(noteManager.loadNote).toHaveBeenCalledTimes(2);
      listSpy.mockRestore();
    });
  });

  describe('삭제된 노트 백링크 정리', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('삭제된 노트의 백링크 정리', async () => {
      const deletedUid = 'deleted-note-id';
      const mockFiles = ['/vault/note1.md', '/vault/note2.md'];

      const note1 = {
        frontMatter: {
          id: 'note1',
          links: ['deleted-note-id', 'other-link']
        }
      };

      const note2 = {
        frontMatter: {
          id: 'note2',
          links: ['other-link']
        }
      };

      const listSpy = jest
        .spyOn(manager as any, 'listMarkdownFiles')
        .mockResolvedValue(mockFiles);
      (noteManager.loadNote as jest.Mock)
        .mockResolvedValueOnce(note1)
        .mockResolvedValueOnce(note2);

      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...note1.frontMatter,
        links: ['other-link']
      });
      (noteManager.saveNote as jest.Mock).mockResolvedValue(undefined);

      const syncEventPromise = new Promise((resolve) => {
        manager.once('backlinkSync', resolve);
      });

      await manager.cleanupBacklinksForDeletedNote(deletedUid);

      const syncEvent = await syncEventPromise;

      expect(noteManager.loadNote).toHaveBeenCalledTimes(2);
      expect(noteManager.saveNote).toHaveBeenCalledTimes(1); // note1만 저장됨
      expect(syncEvent).toMatchObject({
        type: 'remove',
        targetUid: deletedUid,
        affectedNotes: ['note1']
      });
      listSpy.mockRestore();
    });

    test('영향받은 노트가 없는 경우', async () => {
      const deletedUid = 'deleted-note-id';
      const mockFiles = ['/vault/note1.md'];

      const note1 = {
        frontMatter: {
          id: 'note1',
          links: ['other-link'] // 삭제된 노트 링크 없음
        }
      };

      const listSpy = jest
        .spyOn(manager as any, 'listMarkdownFiles')
        .mockResolvedValue(mockFiles);
      (noteManager.loadNote as jest.Mock).mockResolvedValue(note1);

      let syncEventFired = false;
      manager.once('backlinkSync', () => { syncEventFired = true; });

      await manager.cleanupBacklinksForDeletedNote(deletedUid);

      expect(noteManager.saveNote).not.toHaveBeenCalled();
      expect(syncEventFired).toBe(false);
      listSpy.mockRestore();
    });
  });

  describe('파일 변경 이벤트 처리', () => {
    let eventHandler: (eventData: FileWatchEventData) => void;

    beforeEach(async () => {
      await manager.initialize(mockWatcher);

      // 이벤트 핸들러 캡처
      const calls = (mockWatcher.onFileChange as jest.Mock).mock.calls;
      eventHandler = calls[0][0];
    });

    test('노트가 있는 파일 변경 이벤트 처리', () => {
      const eventData: FileWatchEventData = {
        type: 'change',
        filePath: '/vault/test.md',
        note: {
          frontMatter: { id: 'test-id' }
        } as MarkdownNote
      };

      expect(typeof (manager as any).debouncedSync).toBe('function');

      eventHandler(eventData);

      expect(manager.syncStats.pendingUpdates).toBe(1);
    });

    test('노트가 없는 파일 변경 이벤트는 무시', () => {
      const eventData: FileWatchEventData = {
        type: 'change',
        filePath: '/vault/test.md'
        // note 없음
      };

      eventHandler(eventData);

      expect(manager.syncStats.pendingUpdates).toBe(0);
    });

    test('에러 발생 시 error 이벤트 발생', () => {
      const eventData: FileWatchEventData = {
        type: 'change',
        filePath: '/vault/test.md',
        note: { frontMatter: undefined } as any,
      };

      const errorHandler = jest.fn();
      manager.once('error', errorHandler);

      eventHandler(eventData);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('이벤트 핸들러', () => {
    test('onBacklinkSync 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = manager.onBacklinkSync(handler);

      expect(result).toBe(manager); // 체이닝 확인

      manager.emit('backlinkSync', { type: 'update', targetUid: 'test', affectedNotes: [], timestamp: new Date() });

      expect(handler).toHaveBeenCalled();
    });

    test('onError 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = manager.onError(handler);

      expect(result).toBe(manager); // 체이닝 확인

      manager.emit('error', new Error('테스트 에러'));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('syncStats getter', () => {
    test('초기화 전 상태', () => {
      const stats = manager.syncStats;

      expect(stats.isInitialized).toBe(false);
      expect(stats.pendingUpdates).toBe(0);
      expect(stats.autoSync).toBe(true);
    });

    test('초기화 후 상태', async () => {
      await manager.initialize();

      const stats = manager.syncStats;

      expect(stats.isInitialized).toBe(true);
    });
  });
});