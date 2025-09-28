/**
 * FTS Index 모듈 테스트
 */

import { FtsSearchEngine } from '../src/fts-index';
import { SearchError, SearchOptions } from '../src/types';
import {
  createTempDatabase,
  createTestNote,
  createTestNotes,
  createKoreanTestNote,
  createLinkedTestNotes,
  afterEachCleanup,
  validateSearchResult,
  PerformanceTracker
} from './helpers/test-utils';
import { MarkdownNote } from '@memory-mcp/common';

describe('FtsSearchEngine', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    afterEachCleanup();
  });

  describe('초기화 및 구성', () => {
    test('FTS 검색 엔진을 생성할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      expect(ftsEngine).toBeDefined();
    });

    test('생성자에서 준비된 쿼리문들이 초기화된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      expect(() => new FtsSearchEngine(db)).not.toThrow();
    });
  });

  describe('노트 인덱싱', () => {
    test('단일 노트를 인덱싱할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const testNote = createTestNote({
        id: 'test-note-001',
        title: '테스트 노트',
        content: '이것은 테스트용 노트입니다.',
        tags: ['test', 'sample']
      });

      expect(() => ftsEngine.indexNote(testNote)).not.toThrow();

      // 인덱스에 추가되었는지 확인
      const result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(1);
    });

    test('여러 노트를 인덱싱할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const testNotes = createTestNotes(5);

      testNotes.forEach(note => {
        ftsEngine.indexNote(note);
      });

      const result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(5);
    });

    test('한국어 콘텐츠를 인덱싱할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const koreanNote = createKoreanTestNote();

      expect(() => ftsEngine.indexNote(koreanNote)).not.toThrow();

      const result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(1);
    });

    test('마크다운 문법이 포함된 콘텐츠를 정리하여 인덱싱한다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const markdownNote = createTestNote({
        id: 'markdown-test',
        title: 'Markdown Test',
        content: `# 제목

**굵은 글씨**와 *기울임꼴*이 있습니다.

\`\`\`javascript
function test() {
  return "code";
}
\`\`\`

[링크](https://example.com)와 ![이미지](image.png)도 있습니다.
`
      });

      ftsEngine.indexNote(markdownNote);

      // 정리된 콘텐츠가 인덱싱되었는지 확인
      const result = db.prepare('SELECT content FROM notes_fts WHERE uid = ?').get(markdownNote.frontMatter.id) as { content: string };

      expect(result.content).not.toContain('#');
      expect(result.content).not.toContain('**');
      expect(result.content).not.toContain('```');
      expect(result.content).toContain('굵은 글씨');
      expect(result.content).toContain('링크');
    });
  });

  describe('노트 업데이트', () => {
    test('기존 노트를 업데이트할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const originalNote = createTestNote({
        id: 'update-test',
        title: '원본 제목',
        content: '원본 내용'
      });

      // 초기 인덱싱
      ftsEngine.indexNote(originalNote);

      // 업데이트된 노트
      const updatedNote: MarkdownNote = {
        ...originalNote,
        frontMatter: {
          ...originalNote.frontMatter,
          title: '업데이트된 제목'
        },
        content: '업데이트된 내용'
      };

      expect(() => ftsEngine.updateNote(updatedNote)).not.toThrow();

      // 업데이트 확인
      const result = db.prepare('SELECT title, content FROM notes_fts WHERE uid = ?')
        .get(originalNote.frontMatter.id) as { title: string; content: string };

      expect(result.title).toBe('업데이트된 제목');
      expect(result.content).toContain('업데이트된 내용');
    });

    test('존재하지 않는 노트를 업데이트하면 새로 추가된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const newNote = createTestNote({
        id: 'new-note',
        title: '새 노트'
      });

      expect(() => ftsEngine.updateNote(newNote)).not.toThrow();

      const result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(1);
    });
  });

  describe('노트 삭제', () => {
    test('인덱스에서 노트를 삭제할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const testNote = createTestNote({ id: 'delete-test' });
      ftsEngine.indexNote(testNote);

      // 삭제 전 확인
      let result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(1);

      // 삭제
      expect(() => ftsEngine.removeNote(testNote.frontMatter.id)).not.toThrow();

      // 삭제 후 확인
      result = db.prepare('SELECT COUNT(*) as count FROM notes_fts').get() as { count: number };
      expect(result.count).toBe(0);
    });

    test('존재하지 않는 노트를 삭제해도 오류가 발생하지 않는다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      expect(() => ftsEngine.removeNote('non-existing-note')).not.toThrow();
    });
  });

  describe('기본 검색', () => {
    test('빈 데이터베이스에서 검색 시 빈 결과를 반환한다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const result = await ftsEngine.searchNotes('test');

      expect(result.results).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
    });

    test('단일 키워드로 검색할 수 있다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // 노트에 nodes 테이블도 추가해야 함
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('test-001', 'Test Note', 'Resources', '/test/note.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      const testNote = createTestNote({
        id: 'test-001',
        title: 'Test Note',
        content: '이것은 테스트용 노트입니다.'
      });

      ftsEngine.indexNote(testNote);

      const result = await ftsEngine.searchNotes('테스트');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.totalCount).toBeGreaterThan(0);
      validateSearchResult(result.results, 1, ['test-001']);
    });

    test('여러 키워드로 검색할 수 있다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // 테스트 데이터 준비
      const notes = [
        createTestNote({
          id: 'note-1',
          title: 'React TypeScript 가이드',
          content: 'React와 TypeScript를 함께 사용하는 방법을 설명합니다.'
        }),
        createTestNote({
          id: 'note-2',
          title: 'Node.js 백엔드',
          content: 'Node.js로 백엔드 서버를 구축하는 방법입니다.'
        }),
        createTestNote({
          id: 'note-3',
          title: 'React 컴포넌트',
          content: 'React 컴포넌트 설계 패턴에 대한 내용입니다.'
        })
      ];

      // notes 테이블에도 추가
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      // React와 TypeScript 모두 포함된 노트 검색
      const result = await ftsEngine.searchNotes('React TypeScript');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].id).toBe('note-1'); // 가장 관련성 높은 결과
    });

    test('한국어 검색이 정상 작동한다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const koreanNote = createKoreanTestNote();

      // notes 테이블에 추가
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('${koreanNote.frontMatter.id}', '${koreanNote.frontMatter.title}', '${koreanNote.frontMatter.category}', '/test/${koreanNote.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      ftsEngine.indexNote(koreanNote);

      const result = await ftsEngine.searchNotes('프로젝트');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].id).toBe('korean-test-note');
    });
  });

  describe('고급 검색 옵션', () => {
    test('카테고리 필터로 검색할 수 있다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const notes = createTestNotes(10);

      // 데이터 준비
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      const options: SearchOptions = {
        category: 'Projects'
      };

      const result = await ftsEngine.searchNotes('테스트', options);

      // Projects 카테고리만 반환되어야 함
      result.results.forEach(r => {
        expect(r.category).toBe('Projects');
      });
    });

    test('태그 필터로 검색할 수 있다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const notes = createTestNotes(5);

      // 데이터 준비
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      const options: SearchOptions = {
        tags: ['important']
      };

      const result = await ftsEngine.searchNotes('테스트', options);

      // important 태그가 있는 노트만 반환되어야 함
      result.results.forEach(r => {
        expect(r.tags).toContain('important');
      });
    });

    test('페이징 옵션이 정상 작동한다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const notes = createTestNotes(20);

      // 데이터 준비
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      // 첫 번째 페이지
      const page1 = await ftsEngine.searchNotes('테스트', { limit: 5, offset: 0 });
      expect(page1.results).toHaveLength(5);

      // 두 번째 페이지
      const page2 = await ftsEngine.searchNotes('테스트', { limit: 5, offset: 5 });
      expect(page2.results).toHaveLength(5);

      // 결과가 다른지 확인
      const page1Ids = page1.results.map(r => r.id);
      const page2Ids = page2.results.map(r => r.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });

    test('스니펫 길이와 하이라이팅이 정상 작동한다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const testNote = createTestNote({
        id: 'snippet-test',
        title: 'Snippet Test',
        content: '이것은 매우 긴 텍스트입니다. '.repeat(20) + ' 검색어가 여기에 있습니다.'
      });

      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('snippet-test', 'Snippet Test', 'Resources', '/test/snippet.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      ftsEngine.indexNote(testNote);

      const options: SearchOptions = {
        snippetLength: 100,
        highlightTag: 'mark'
      };

      const result = await ftsEngine.searchNotes('검색어', options);

      expect(result.results).toHaveLength(1);
      const snippet = result.results[0].snippet;
      expect(snippet.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(snippet).toContain('<mark>');
      expect(snippet).toContain('</mark>');
    });
  });

  describe('성능 메트릭', () => {
    test('검색 성능 메트릭이 올바르게 수집된다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // 데이터 준비
      const notes = createTestNotes(10);
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      const result = await ftsEngine.searchNotes('테스트');

      expect(result.metrics).toBeDefined();
      expect(result.metrics.queryTimeMs).toBeGreaterThan(0);
      expect(result.metrics.processingTimeMs).toBeGreaterThan(0);
      expect(result.metrics.totalTimeMs).toBeGreaterThan(0);
      expect(result.metrics.totalResults).toBeGreaterThanOrEqual(result.metrics.returnedResults);
      expect(typeof result.metrics.cacheHit).toBe('boolean');
    });

    test('대용량 데이터 검색 성능이 합리적이다', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // 대용량 데이터 준비 (100개 노트)
      const notes = createTestNotes(100);
      notes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        ftsEngine.indexNote(note);
      });

      const tracker = new PerformanceTracker();
      tracker.start();

      const result = await ftsEngine.searchNotes('테스트');

      const totalTime = tracker.getTotalTime();

      expect(result.results.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(1000); // 1초 이내
      expect(result.metrics.totalTimeMs).toBeLessThan(500); // 500ms 이내
    });
  });

  describe('에러 처리', () => {
    test('잘못된 검색 쿼리 처리', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // 빈 쿼리
      const result1 = await ftsEngine.searchNotes('');
      expect(result1.results).toHaveLength(0);

      // 특수문자만 포함된 쿼리
      const result2 = await ftsEngine.searchNotes('!!!@@@###');
      expect(result2.results).toHaveLength(0);
    });

    test('손상된 FTS 데이터 처리', async () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      // FTS 테이블에 잘못된 데이터 삽입
      try {
        db.exec(`INSERT INTO notes_fts (uid, title, content) VALUES (NULL, NULL, NULL)`);
      } catch {
        // 예상된 오류
      }

      // 검색이 여전히 작동해야 함
      const result = await ftsEngine.searchNotes('test');
      expect(result.results).toHaveLength(0);
    });

    test('잘못된 노트 데이터로 인덱싱 시 오류 발생', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const ftsEngine = new FtsSearchEngine(db);

      const invalidNote = {
        frontMatter: {
          id: null as any,
          title: null as any,
          category: 'Resources',
          tags: ['test'],
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          links: []
        },
        content: 'test content',
        filePath: '/test/invalid.md'
      };

      expect(() => ftsEngine.indexNote(invalidNote as any)).toThrow(SearchError);
    });
  });
});