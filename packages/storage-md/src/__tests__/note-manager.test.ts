/**
 * NoteManager 테스트
 */

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import {
  loadNote,
  saveNote,
  findNoteByUid,
  analyzeLinks,
  createNote,
  deleteNote,
  listNotes,
  findNotesByTag,
  findNotesByProject,
  getNoteStats
} from '../note-manager';
import { MarkdownNote, FrontMatter } from '@memory-mcp/common';

// Mock dependencies
jest.mock('../file-operations');
jest.mock('../front-matter');
jest.mock('@memory-mcp/common', () => ({
  parseMarkdownLinks: jest.fn(),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as fileOperations from '../file-operations';
import * as frontMatter from '../front-matter';
import { parseMarkdownLinks } from '@memory-mcp/common';

// 임시 테스트 디렉토리
const TEMP_DIR = path.join(__dirname, '../../temp-note-test');

describe('NoteManager', () => {
  const mockNote: MarkdownNote = {
    filePath: path.join(TEMP_DIR, 'test.md'),
    frontMatter: {
      id: 'test-note-id',
      title: 'Test Note',
      category: 'Resources' as const,
      tags: ['test', 'sample'],
      created: '2023-01-01T00:00:00Z',
      updated: '2023-01-02T00:00:00Z',
      project: 'test-project',
      links: ['link1', 'link2']
    },
    content: '# Test Note\n\nThis is a test note with [[link1]] and [[link2]].',
    metadata: {
      size: 100,
      created: new Date('2023-01-01'),
      modified: new Date('2023-01-02'),
      hash: 'test-hash'
    }
  };

  beforeEach(async () => {
    // 임시 디렉토리 생성
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Mock implementations clear
    jest.clearAllMocks();
    (fileOperations.readFile as jest.Mock).mockClear();
    (fileOperations.writeFile as jest.Mock).mockClear();
    (fileOperations.fileExists as jest.Mock).mockClear();
    (fileOperations.listFiles as jest.Mock).mockClear();
    (fileOperations.getFileStats as jest.Mock).mockClear();
    (frontMatter.parseFrontMatter as jest.Mock).mockClear();
    (frontMatter.serializeMarkdownNote as jest.Mock).mockClear();
    (frontMatter.generateFrontMatterFromTitle as jest.Mock).mockClear();
    (parseMarkdownLinks as jest.Mock).mockClear();

    // 기본 mock 설정
    (fileOperations.fileExists as jest.Mock).mockResolvedValue(true);
    (fileOperations.normalizePath as jest.Mock).mockImplementation((path) => path);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // 무시 - 테스트 디렉토리가 없을 수 있음
    }
  });

  describe('loadNote', () => {
    test('정상적인 노트 로드', async () => {
      const fileContent = '---\nid: test-note-id\ntitle: Test Note\n---\n\n# Test Note\n\nContent';

      (fileOperations.readFile as jest.Mock).mockResolvedValue(fileContent);
      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date('2023-01-01'),
        modified: new Date('2023-01-02')
      });
      (frontMatter.parseFrontMatter as jest.Mock).mockReturnValue({
        frontMatter: mockNote.frontMatter,
        content: mockNote.content
      });

      const result = await loadNote(mockNote.filePath);

      expect(fileOperations.readFile).toHaveBeenCalledWith(mockNote.filePath, 'utf-8');
      expect(frontMatter.parseFrontMatter).toHaveBeenCalledWith(fileContent, false);
      expect(result.filePath).toBe(mockNote.filePath);
      expect(result.frontMatter).toEqual(mockNote.frontMatter);
      expect(result.content).toBe(mockNote.content);
    });

    test('존재하지 않는 파일 로드 시 에러', async () => {
      (fileOperations.fileExists as jest.Mock).mockResolvedValue(false);

      await expect(loadNote('/nonexistent/file.md')).rejects.toThrow('노트 파일을 찾을 수 없습니다');
    });

    test('잘못된 Front Matter 처리', async () => {
      const fileContent = '---\ninvalid yaml\n---\n\nContent';

      (fileOperations.readFile as jest.Mock).mockResolvedValue(fileContent);
      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });
      (frontMatter.parseFrontMatter as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      await expect(loadNote('/test/invalid.md')).rejects.toThrow('노트 로드 실패');
    });

    test('validateFrontMatter 옵션', async () => {
      const fileContent = '---\nid: test\n---\nContent';

      (fileOperations.readFile as jest.Mock).mockResolvedValue(fileContent);
      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });
      (frontMatter.parseFrontMatter as jest.Mock).mockReturnValue({
        frontMatter: { id: 'test' },
        content: 'Content'
      });

      await loadNote('/test/file.md', { validateFrontMatter: false });

      expect(frontMatter.parseFrontMatter).toHaveBeenCalledWith(fileContent, false);
    });
  });

  describe('saveNote', () => {
    test('정상적인 노트 저장', async () => {
      const serializedContent = '---\nid: test-note-id\n---\n\nContent';

      (frontMatter.serializeMarkdownNote as jest.Mock).mockReturnValue(serializedContent);
      (fileOperations.writeFile as jest.Mock).mockResolvedValue(undefined);

      await saveNote(mockNote);

      expect(frontMatter.serializeMarkdownNote).toHaveBeenCalledWith(mockNote);
      expect(fileOperations.writeFile).toHaveBeenCalledWith(
        mockNote.filePath,
        serializedContent,
        'utf-8'
      );
    });

    test('원자적 저장 옵션', async () => {
      const serializedContent = '---\nid: test-note-id\n---\n\nContent';

      (frontMatter.serializeMarkdownNote as jest.Mock).mockReturnValue(serializedContent);
      (fileOperations.atomicWrite as jest.Mock).mockResolvedValue(undefined);

      await saveNote(mockNote, { atomic: true });

      expect(fileOperations.atomicWrite).toHaveBeenCalledWith(
        mockNote.filePath,
        serializedContent,
        'utf-8'
      );
    });

    test('백업 생성 옵션', async () => {
      const serializedContent = '---\nid: test-note-id\n---\n\nContent';

      (frontMatter.serializeMarkdownNote as jest.Mock).mockReturnValue(serializedContent);
      (fileOperations.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileOperations.createBackup as jest.Mock).mockResolvedValue('/backup/path.md.bak');

      const result = await saveNote(mockNote, { createBackup: true });

      expect(fileOperations.createBackup).toHaveBeenCalledWith(mockNote.filePath);
      expect(result?.backupPath).toBe('/backup/path.md.bak');
    });

    test('저장 실패 시 에러', async () => {
      (frontMatter.serializeMarkdownNote as jest.Mock).mockReturnValue('content');
      (fileOperations.writeFile as jest.Mock).mockRejectedValue(
        new Error('디스크 쓰기 실패')
      );

      await expect(saveNote(mockNote)).rejects.toThrow('노트 저장 실패');
    });
  });

  describe('findNoteByUid', () => {
    test('UID로 노트 찾기', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md', '/vault/target.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: other-id\n---\nContent')
        .mockResolvedValueOnce('---\nid: another-id\n---\nContent')
        .mockResolvedValueOnce('---\nid: target-id\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'other-id' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'another-id' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'target-id' }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await findNoteByUid('target-id', '/vault');

      expect(result?.frontMatter.id).toBe('target-id');
      expect(result?.filePath).toBe('/vault/target.md');
    });

    test('존재하지 않는 UID', async () => {
      const files = ['/vault/note1.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock).mockResolvedValue('---\nid: other-id\n---\nContent');
      (frontMatter.parseFrontMatter as jest.Mock).mockReturnValue({
        frontMatter: { id: 'other-id' },
        content: 'Content'
      });

      const result = await findNoteByUid('nonexistent-id', '/vault');

      expect(result).toBeNull();
    });

    test('파일 읽기 실패 시 건너뛰기', async () => {
      const files = ['/vault/broken.md', '/vault/good.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockRejectedValueOnce(new Error('파일 읽기 실패'))
        .mockResolvedValueOnce('---\nid: target-id\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock).mockReturnValue({
        frontMatter: { id: 'target-id' },
        content: 'Content'
      });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await findNoteByUid('target-id', '/vault');

      expect(result?.frontMatter.id).toBe('target-id');
    });
  });

  describe('analyzeLinks', () => {
    test('링크 분석', async () => {
      const note = {
        ...mockNote,
        content: 'Content with [[link1]] and [[link2]] and [[broken-link]]'
      };

      (parseMarkdownLinks as jest.Mock).mockReturnValue(['link1', 'link2', 'broken-link']);
      (fileOperations.listFiles as jest.Mock).mockResolvedValue([
        '/vault/link1.md',
        '/vault/link2.md',
        '/vault/other.md'
      ]);

      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: link1\n---\nContent')
        .mockResolvedValueOnce('---\nid: link2\n---\nContent')
        .mockResolvedValueOnce('---\nid: other\n---\nContent with [[test-note-id]]');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'link1' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'link2' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'other' }, content: 'Content with [[test-note-id]]' });

      (parseMarkdownLinks as jest.Mock)
        .mockReturnValueOnce(['link1', 'link2', 'broken-link']) // 첫 번째 호출
        .mockReturnValueOnce([]) // link1 파일
        .mockReturnValueOnce([]) // link2 파일
        .mockReturnValueOnce(['test-note-id']); // other 파일

      const result = await analyzeLinks(note, '/vault');

      expect(result.outboundLinks).toEqual(['link1', 'link2']);
      expect(result.brokenLinks).toEqual(['broken-link']);
      expect(result.inboundLinks).toEqual(['other']);
    });

    test('빈 콘텐츠에 대한 링크 분석', async () => {
      const note = { ...mockNote, content: '' };

      (parseMarkdownLinks as jest.Mock).mockReturnValue([]);
      (fileOperations.listFiles as jest.Mock).mockResolvedValue([]);

      const result = await analyzeLinks(note, '/vault');

      expect(result.outboundLinks).toEqual([]);
      expect(result.brokenLinks).toEqual([]);
      expect(result.inboundLinks).toEqual([]);
    });
  });

  describe('createNote', () => {
    test('새 노트 생성', async () => {
      const newFrontMatter: FrontMatter = {
        id: 'new-note-id',
        title: 'New Note',
        category: 'Projects' as const,
        tags: ['new'],
        created: '2023-01-01T00:00:00Z',
        updated: '2023-01-01T00:00:00Z',
        links: []
      };

      (frontMatter.generateFrontMatterFromTitle as jest.Mock).mockReturnValue(newFrontMatter);
      (frontMatter.serializeMarkdownNote as jest.Mock).mockReturnValue(
        '---\nid: new-note-id\n---\n\n# New Note\n\nContent'
      );
      (fileOperations.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await createNote('/vault/new.md', 'New Note', 'Content');

      expect(frontMatter.generateFrontMatterFromTitle).toHaveBeenCalledWith('New Note');
      expect(result.frontMatter.title).toBe('New Note');
      expect(result.content).toBe('Content');
      expect(result.filePath).toBe('/vault/new.md');
    });

    test('이미 존재하는 파일에 노트 생성 시도', async () => {
      (fileOperations.fileExists as jest.Mock).mockResolvedValue(true);

      await expect(createNote('/vault/existing.md', 'Title', 'Content')).rejects.toThrow(
        '파일이 이미 존재합니다'
      );
    });
  });

  describe('deleteNote', () => {
    test('노트 삭제', async () => {
      (fileOperations.deleteFile as jest.Mock).mockResolvedValue(undefined);

      await deleteNote('/vault/delete.md');

      expect(fileOperations.deleteFile).toHaveBeenCalledWith('/vault/delete.md');
    });

    test('백업과 함께 노트 삭제', async () => {
      (fileOperations.createBackup as jest.Mock).mockResolvedValue('/backup/delete.md.bak');
      (fileOperations.deleteFile as jest.Mock).mockResolvedValue(undefined);

      const result = await deleteNote('/vault/delete.md', { createBackup: true });

      expect(fileOperations.createBackup).toHaveBeenCalledWith('/vault/delete.md');
      expect(fileOperations.deleteFile).toHaveBeenCalledWith('/vault/delete.md');
      expect(result.backupPath).toBe('/backup/delete.md.bak');
    });
  });

  describe('listNotes', () => {
    test('모든 노트 목록 조회', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: note1\ntitle: Note 1\n---\nContent')
        .mockResolvedValueOnce('---\nid: note2\ntitle: Note 2\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'note1', title: 'Note 1' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note2', title: 'Note 2' }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await listNotes('/vault');

      expect(result).toHaveLength(2);
      expect(result[0].frontMatter.id).toBe('note1');
      expect(result[1].frontMatter.id).toBe('note2');
    });

    test('필터 옵션 적용', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: note1\ncategory: Projects\n---\nContent')
        .mockResolvedValueOnce('---\nid: note2\ncategory: Areas\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'note1', category: 'Projects' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note2', category: 'Areas' }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await listNotes('/vault', {
        filter: (note) => note.frontMatter.category === 'Projects'
      });

      expect(result).toHaveLength(1);
      expect(result[0].frontMatter.category).toBe('Projects');
    });
  });

  describe('findNotesByTag', () => {
    test('태그로 노트 찾기', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md', '/vault/note3.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: note1\ntags: [test, sample]\n---\nContent')
        .mockResolvedValueOnce('---\nid: note2\ntags: [test]\n---\nContent')
        .mockResolvedValueOnce('---\nid: note3\ntags: [other]\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'note1', tags: ['test', 'sample'] }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note2', tags: ['test'] }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note3', tags: ['other'] }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await findNotesByTag('test', '/vault');

      expect(result).toHaveLength(2);
      expect(result[0].frontMatter.id).toBe('note1');
      expect(result[1].frontMatter.id).toBe('note2');
    });
  });

  describe('findNotesByProject', () => {
    test('프로젝트로 노트 찾기', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: note1\nproject: my-project\n---\nContent')
        .mockResolvedValueOnce('---\nid: note2\nproject: other-project\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'note1', project: 'my-project' }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note2', project: 'other-project' }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await findNotesByProject('my-project', '/vault');

      expect(result).toHaveLength(1);
      expect(result[0].frontMatter.project).toBe('my-project');
    });
  });

  describe('getNoteStats', () => {
    test('노트 통계 조회', async () => {
      const files = ['/vault/note1.md', '/vault/note2.md', '/vault/note3.md'];

      (fileOperations.listFiles as jest.Mock).mockResolvedValue(files);
      (fileOperations.readFile as jest.Mock)
        .mockResolvedValueOnce('---\nid: note1\ncategory: Projects\ntags: [tag1]\n---\nContent')
        .mockResolvedValueOnce('---\nid: note2\ncategory: Projects\ntags: [tag1, tag2]\n---\nContent')
        .mockResolvedValueOnce('---\nid: note3\ncategory: Areas\ntags: [tag2]\n---\nContent');

      (frontMatter.parseFrontMatter as jest.Mock)
        .mockReturnValueOnce({ frontMatter: { id: 'note1', category: 'Projects', tags: ['tag1'] }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note2', category: 'Projects', tags: ['tag1', 'tag2'] }, content: 'Content' })
        .mockReturnValueOnce({ frontMatter: { id: 'note3', category: 'Areas', tags: ['tag2'] }, content: 'Content' });

      (fileOperations.getFileStats as jest.Mock).mockResolvedValue({
        size: 100,
        created: new Date(),
        modified: new Date()
      });

      const result = await getNoteStats('/vault');

      expect(result.totalNotes).toBe(3);
      expect(result.categoryCounts.Projects).toBe(2);
      expect(result.categoryCounts.Areas).toBe(1);
      expect(result.tagCounts.tag1).toBe(2);
      expect(result.tagCounts.tag2).toBe(2);
    });
  });
});