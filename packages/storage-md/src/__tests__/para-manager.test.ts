/**
 * ParaManager 테스트
 */

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { ParaManager, createParaManager, type ParaCategory, type ParaMoveEvent } from '../para-manager';
import { MarkdownNote } from '@memory-mcp/common';

// Mock dependencies
jest.mock('../file-operations');
jest.mock('../note-manager');
jest.mock('../front-matter');
jest.mock('@memory-mcp/common', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as fileOperations from '../file-operations';
import * as noteManager from '../note-manager';
import * as frontMatter from '../front-matter';

// 임시 테스트 디렉토리
const TEMP_DIR = path.join(__dirname, '../../temp-para-test');

describe('ParaManager', () => {
  let manager: ParaManager;

  beforeEach(async () => {
    // 임시 디렉토리 생성
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Mock implementations
    (fileOperations.ensureDirectory as jest.Mock).mockClear();
    (fileOperations.directoryExists as jest.Mock).mockClear();
    (fileOperations.moveFile as jest.Mock).mockClear();
    (fileOperations.listFiles as jest.Mock).mockClear();
    (noteManager.loadNote as jest.Mock).mockClear();
    (noteManager.saveNote as jest.Mock).mockClear();
    (frontMatter.updateFrontMatter as jest.Mock).mockClear();

    // 기본 성공 mock 설정
    (fileOperations.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
    (fileOperations.normalizePath as jest.Mock).mockImplementation((path) => path);

    const config = {
      rootPath: TEMP_DIR,
      directories: {
        Projects: '1-Projects',
        Areas: '2-Areas',
        Resources: '3-Resources',
        Archives: '4-Archives'
      }
    };

    manager = new ParaManager(config);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // 무시 - 테스트 디렉토리가 없을 수 있음
    }
  });

  describe('생성자 및 초기화', () => {
    test('기본 설정으로 ParaManager 생성', () => {
      const config = {
        rootPath: TEMP_DIR,
        directories: {
          Projects: 'Projects',
          Areas: 'Areas',
          Resources: 'Resources',
          Archives: 'Archives'
        }
      };

      const manager = new ParaManager(config);

      expect(manager).toBeInstanceOf(ParaManager);
      expect(manager.configuration.autoMove).toBe(true);
      expect(manager.configuration.createProjectSubdirs).toBe(true);
      expect(manager.configuration.archiveThresholdDays).toBe(90);
    });

    test('커스텀 설정으로 ParaManager 생성', () => {
      const config = {
        rootPath: TEMP_DIR,
        directories: {
          Projects: 'Custom-Projects',
          Areas: 'Custom-Areas',
          Resources: 'Custom-Resources',
          Archives: 'Custom-Archives'
        },
        autoMove: false,
        createProjectSubdirs: false,
        archiveThresholdDays: 30
      };

      const manager = new ParaManager(config);

      expect(manager.configuration.autoMove).toBe(false);
      expect(manager.configuration.createProjectSubdirs).toBe(false);
      expect(manager.configuration.archiveThresholdDays).toBe(30);
      expect(manager.configuration.directories.Projects).toBe('Custom-Projects');
    });

    test('팩토리 함수로 ParaManager 생성', () => {
      const config = {
        rootPath: TEMP_DIR,
        directories: {
          Projects: '1-Projects',
          Areas: '2-Areas',
          Resources: '3-Resources',
          Archives: '4-Archives'
        }
      };

      const manager = createParaManager(config);

      expect(manager).toBeInstanceOf(ParaManager);
    });

    test('PARA 구조 초기화', async () => {
      (fileOperations.ensureDirectory as jest.Mock).mockResolvedValue(undefined);

      await manager.initialize();

      expect(fileOperations.ensureDirectory).toHaveBeenCalledTimes(4);
      expect(fileOperations.ensureDirectory).toHaveBeenCalledWith(
        path.join(TEMP_DIR, '1-Projects')
      );
      expect(fileOperations.ensureDirectory).toHaveBeenCalledWith(
        path.join(TEMP_DIR, '2-Areas')
      );
      expect(fileOperations.ensureDirectory).toHaveBeenCalledWith(
        path.join(TEMP_DIR, '3-Resources')
      );
      expect(fileOperations.ensureDirectory).toHaveBeenCalledWith(
        path.join(TEMP_DIR, '4-Archives')
      );
    });

    test('이미 초기화된 상태에서 재초기화', async () => {
      (fileOperations.ensureDirectory as jest.Mock).mockResolvedValue(undefined);

      await manager.initialize();
      await manager.initialize(); // 두 번째 호출

      expect(fileOperations.ensureDirectory).toHaveBeenCalledTimes(4); // 한 번만 실행됨
    });

    test('초기화 실패 시 에러 처리', async () => {
      (fileOperations.ensureDirectory as jest.Mock).mockRejectedValue(
        new Error('디렉토리 생성 실패')
      );

      await expect(manager.initialize()).rejects.toThrow('PARA 구조 초기화 실패');
    });
  });

  describe('노트 정리', () => {
    const createMockNote = (
      id: string,
      category: ParaCategory,
      project?: string,
      daysOld: number = 0
    ): MarkdownNote => {
      const date = new Date();
      date.setDate(date.getDate() - daysOld);

      return {
        filePath: `/vault/${id}.md`,
        frontMatter: {
          id,
          title: `Test Note ${id}`,
          category,
          tags: [],
          created: date.toISOString(),
          updated: date.toISOString(),
          project,
          links: []
        },
        content: 'Test content',
        metadata: {
          size: 100,
          created: date,
          modified: date,
          hash: 'test-hash'
        }
      };
    };

    beforeEach(async () => {
      await manager.initialize();
      (fileOperations.ensureDirectory as jest.Mock).mockResolvedValue(undefined);
      (fileOperations.moveFile as jest.Mock).mockResolvedValue(undefined);
      (noteManager.saveNote as jest.Mock).mockResolvedValue(undefined);
    });

    test('프로젝트가 있는 노트는 Projects로 이동', async () => {
      const note = createMockNote('test1', 'Resources', 'test-project');

      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...note.frontMatter,
        category: 'Projects'
      });

      const moveEventPromise = new Promise<ParaMoveEvent>((resolve) => {
        manager.once('noteMoved', resolve);
      });

      const result = await manager.organizeNote(note);

      expect(result).toBeDefined();
      expect(frontMatter.updateFrontMatter).toHaveBeenCalledWith(
        note.frontMatter,
        { category: 'Projects' }
      );

      const moveEvent = await moveEventPromise;
      expect(moveEvent.fromCategory).toBe('Resources');
      expect(moveEvent.toCategory).toBe('Projects');
      expect(moveEvent.reason).toBe('category-change');
    });

    test('오래된 노트는 Archives로 이동', async () => {
      const note = createMockNote('test2', 'Areas', undefined, 100); // 100일 전

      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...note.frontMatter,
        category: 'Archives'
      });

      const result = await manager.organizeNote(note);

      expect(result).toBeDefined();
      expect(frontMatter.updateFrontMatter).toHaveBeenCalledWith(
        note.frontMatter,
        { category: 'Archives' }
      );
    });

    test('이미 올바른 카테고리에 있는 노트는 이동하지 않음', async () => {
      const note = createMockNote('test3', 'Resources');

      const result = await manager.organizeNote(note);

      expect(result).toBeNull();
      expect(fileOperations.moveFile).not.toHaveBeenCalled();
    });

    test('autoMove가 false인 경우 파일 이동 없이 카테고리만 업데이트', async () => {
      const configNoAutoMove = {
        rootPath: TEMP_DIR,
        directories: {
          Projects: '1-Projects',
          Areas: '2-Areas',
          Resources: '3-Resources',
          Archives: '4-Archives'
        },
        autoMove: false
      };

      const managerNoMove = new ParaManager(configNoAutoMove);
      await managerNoMove.initialize();

      const note = createMockNote('test4', 'Resources', 'test-project');

      (frontMatter.updateFrontMatter as jest.Mock).mockReturnValue({
        ...note.frontMatter,
        category: 'Projects'
      });

      const result = await managerNoMove.organizeNote(note);

      expect(result).toBe(note.filePath); // 원래 경로 반환
      expect(fileOperations.moveFile).not.toHaveBeenCalled();
      expect(noteManager.saveNote).toHaveBeenCalled();
    });

    test('초기화되지 않은 상태에서 노트 정리 시 에러', async () => {
      const uninitializedManager = new ParaManager({
        rootPath: TEMP_DIR,
        directories: {
          Projects: '1-Projects',
          Areas: '2-Areas',
          Resources: '3-Resources',
          Archives: '4-Archives'
        }
      });

      const note = createMockNote('test5', 'Resources');

      await expect(uninitializedManager.organizeNote(note)).rejects.toThrow(
        'ParaManager가 초기화되지 않았습니다'
      );
    });
  });

  describe('자동 아카이브', () => {
    beforeEach(async () => {
      await manager.initialize();
      (fileOperations.directoryExists as jest.Mock).mockResolvedValue(true);
      (fileOperations.moveFile as jest.Mock).mockResolvedValue(undefined);
      (noteManager.saveNote as jest.Mock).mockResolvedValue(undefined);
    });

    test('오래된 노트들을 Archives로 자동 이동', async () => {
      const oldNote1 = {
        frontMatter: {
          id: 'old1',
          updated: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString() // 100일 전
        }
      };

      const oldNote2 = {
        frontMatter: {
          id: 'old2',
          updated: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString() // 95일 전
        }
      };

      const recentNote = {
        frontMatter: {
          id: 'recent',
          updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30일 전
        }
      };

      (fileOperations.listFiles as jest.Mock)
        .mockResolvedValueOnce(['/vault/projects/old1.md', '/vault/projects/recent.md'])
        .mockResolvedValueOnce(['/vault/areas/old2.md']);

      (noteManager.loadNote as jest.Mock)
        .mockResolvedValueOnce(oldNote1)
        .mockResolvedValueOnce(recentNote)
        .mockResolvedValueOnce(oldNote2);

      (frontMatter.updateFrontMatter as jest.Mock).mockImplementation((fm, updates) => ({
        ...fm,
        ...updates
      }));

      const archivedNotes = await manager.archiveOldNotes();

      expect(archivedNotes).toHaveLength(2);
      expect(archivedNotes[0].noteId).toBe('old1');
      expect(archivedNotes[1].noteId).toBe('old2');
      expect(archivedNotes[0].reason).toBe('auto-archive');
      expect(archivedNotes[1].reason).toBe('auto-archive');
    });

    test('Projects 디렉토리가 없는 경우 건너뛰기', async () => {
      (fileOperations.directoryExists as jest.Mock)
        .mockResolvedValueOnce(false) // Projects 없음
        .mockResolvedValueOnce(true);  // Areas 있음

      (fileOperations.listFiles as jest.Mock).mockResolvedValue([]);

      const archivedNotes = await manager.archiveOldNotes();

      expect(archivedNotes).toHaveLength(0);
      expect(fileOperations.listFiles).toHaveBeenCalledTimes(1); // Areas만 확인
    });
  });

  describe('프로젝트 아카이브', () => {
    beforeEach(async () => {
      await manager.initialize();
      (fileOperations.directoryExists as jest.Mock).mockResolvedValue(true);
      (fileOperations.moveFile as jest.Mock).mockResolvedValue(undefined);
      (noteManager.saveNote as jest.Mock).mockResolvedValue(undefined);
    });

    test('특정 프로젝트의 모든 노트를 Archives로 이동', async () => {
      const projectNote1 = {
        frontMatter: {
          id: 'proj1',
          project: 'test-project'
        }
      };

      const projectNote2 = {
        frontMatter: {
          id: 'proj2',
          project: 'test-project'
        }
      };

      const otherProjectNote = {
        frontMatter: {
          id: 'other',
          project: 'other-project'
        }
      };

      (fileOperations.listFiles as jest.Mock).mockResolvedValue([
        '/vault/projects/proj1.md',
        '/vault/projects/proj2.md',
        '/vault/projects/other.md'
      ]);

      (noteManager.loadNote as jest.Mock)
        .mockResolvedValueOnce(projectNote1)
        .mockResolvedValueOnce(projectNote2)
        .mockResolvedValueOnce(otherProjectNote);

      (frontMatter.updateFrontMatter as jest.Mock).mockImplementation((fm, updates) => ({
        ...fm,
        ...updates
      }));

      const archivedNotes = await manager.archiveProject('test-project');

      expect(archivedNotes).toHaveLength(2);
      expect(archivedNotes[0].noteId).toBe('proj1');
      expect(archivedNotes[1].noteId).toBe('proj2');
      expect(archivedNotes[0].reason).toBe('manual');
      expect(archivedNotes[1].reason).toBe('manual');
    });

    test('Projects 디렉토리가 없는 경우', async () => {
      (fileOperations.directoryExists as jest.Mock).mockResolvedValue(false);

      const archivedNotes = await manager.archiveProject('test-project');

      expect(archivedNotes).toHaveLength(0);
      expect(fileOperations.listFiles).not.toHaveBeenCalled();
    });
  });

  describe('통계 및 정보 조회', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    test('PARA 구조 통계 조회', async () => {
      (fileOperations.directoryExists as jest.Mock).mockResolvedValue(true);
      (fileOperations.listFiles as jest.Mock)
        .mockResolvedValueOnce(['proj1.md', 'proj2.md']) // Projects: 2개
        .mockResolvedValueOnce(['area1.md']) // Areas: 1개
        .mockResolvedValueOnce(['res1.md', 'res2.md', 'res3.md']) // Resources: 3개
        .mockResolvedValueOnce([]); // Archives: 0개

      const stats = await manager.getStats();

      expect(stats).toEqual({
        Projects: 2,
        Areas: 1,
        Resources: 3,
        Archives: 0
      });
    });

    test('존재하지 않는 디렉토리는 0으로 계산', async () => {
      (fileOperations.directoryExists as jest.Mock)
        .mockResolvedValueOnce(true)  // Projects 존재
        .mockResolvedValueOnce(false) // Areas 없음
        .mockResolvedValueOnce(true)  // Resources 존재
        .mockResolvedValueOnce(true); // Archives 존재

      (fileOperations.listFiles as jest.Mock)
        .mockResolvedValueOnce(['proj1.md'])
        .mockResolvedValueOnce(['res1.md'])
        .mockResolvedValueOnce([]);

      const stats = await manager.getStats();

      expect(stats.Areas).toBe(0);
      expect(stats.Projects).toBe(1);
    });

    test('카테고리별 경로 조회', () => {
      const projectsPath = manager.getCategoryPath('Projects');
      const areasPath = manager.getCategoryPath('Areas');

      expect(projectsPath).toBe(path.join(TEMP_DIR, '1-Projects'));
      expect(areasPath).toBe(path.join(TEMP_DIR, '2-Areas'));
    });

    test('설정 조회', () => {
      const config = manager.configuration;

      expect(config.rootPath).toBe(TEMP_DIR);
      expect(config.autoMove).toBe(true);
      expect(config.createProjectSubdirs).toBe(true);
      expect(config.archiveThresholdDays).toBe(90);
    });
  });

  describe('이벤트 핸들러', () => {
    test('onNoteMoved 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = manager.onNoteMoved(handler);

      expect(result).toBe(manager); // 체이닝 확인

      const moveEvent: ParaMoveEvent = {
        noteId: 'test',
        fromPath: '/old.md',
        toPath: '/new.md',
        fromCategory: 'Areas',
        toCategory: 'Projects',
        reason: 'manual',
        timestamp: new Date()
      };

      manager.emit('noteMoved', moveEvent);

      expect(handler).toHaveBeenCalledWith(moveEvent);
    });

    test('onError 이벤트 핸들러 등록', () => {
      const handler = jest.fn();
      const result = manager.onError(handler);

      expect(result).toBe(manager); // 체이닝 확인

      manager.emit('error', new Error('테스트 에러'));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('내부 유틸리티 메서드', () => {
    test('디렉토리명 정리', () => {
      const manager = new ParaManager({
        rootPath: TEMP_DIR,
        directories: {
          Projects: '1-Projects',
          Areas: '2-Areas',
          Resources: '3-Resources',
          Archives: '4-Archives'
        }
      });

      // private 메서드이지만 테스트를 위해 내부 구현 검증
      // 실제로는 파일명 생성 테스트를 통해 간접 검증
      expect(typeof manager['sanitizeDirName']).toBe('function');
    });

    test('파일명 생성', () => {
      const manager = new ParaManager({
        rootPath: TEMP_DIR,
        directories: {
          Projects: '1-Projects',
          Areas: '2-Areas',
          Resources: '3-Resources',
          Archives: '4-Archives'
        }
      });

      // private 메서드이지만 테스트를 위해 내부 구현 검증
      expect(typeof manager['generateFileName']).toBe('function');
    });

    test('아카이브 대상 확인', () => {
      const oldNote = {
        frontMatter: {
          updated: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString() // 100일 전
        }
      } as MarkdownNote;

      const recentNote = {
        frontMatter: {
          updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30일 전
        }
      } as MarkdownNote;

      expect(manager['shouldArchive'](oldNote)).toBe(true);
      expect(manager['shouldArchive'](recentNote)).toBe(false);
    });
  });
});