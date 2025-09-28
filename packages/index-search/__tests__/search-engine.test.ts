/**
 * Search Engine 모듈 테스트
 */

import { IndexSearchEngine, createDefaultSearchEngine } from '../src/search-engine';
import { IndexingError, SearchOptions, BacklinkOptions, ConnectedNotesOptions } from '../src/types';
import {
  createTempDatabase,
  createTestNote,
  createTestNotes,
  createKoreanTestNote,
  createLinkedTestNotes,
  createLargeTestDataset,
  afterEachCleanup,
  validateSearchResult,
  PerformanceTracker
} from './helpers/test-utils';
import { MarkdownNote } from '@memory-mcp/common';
import * as path from 'path';

describe('IndexSearchEngine', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    afterEachCleanup();
  });

  describe('초기화 및 구성', () => {
    test('검색 엔진을 생성할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const config = { dbPath };
      const searchEngine = new IndexSearchEngine(config);

      expect(searchEngine).toBeDefined();
    });

    test('기본 설정으로 검색 엔진을 생성할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      expect(searchEngine).toBeDefined();
    });

    test('커스텀 설정으로 검색 엔진을 생성할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath, {
        walMode: false,
        cacheSize: 2048,
        pageSize: 8192
      });

      expect(searchEngine).toBeDefined();
    });
  });

  describe('노트 인덱싱', () => {
    test('단일 노트를 인덱싱할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNote = createTestNote({
        id: 'test-001',
        title: '테스트 노트',
        content: '이것은 테스트용 노트입니다.'
      });

      expect(() => searchEngine.indexNote(testNote)).not.toThrow();

      const stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(1);
    });

    test('여러 노트를 인덱싱할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNotes = createTestNotes(5);

      testNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(5);
    });

    test('동일한 노트를 재인덱싱할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const originalNote = createTestNote({
        id: 'update-test',
        title: '원본 제목',
        content: '원본 내용'
      });

      // 초기 인덱싱
      searchEngine.indexNote(originalNote);

      let stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(1);

      // 업데이트된 노트
      const updatedNote: MarkdownNote = {
        ...originalNote,
        frontMatter: {
          ...originalNote.frontMatter,
          title: '업데이트된 제목',
          updated: new Date().toISOString()
        },
        content: '업데이트된 내용'
      };

      // 재인덱싱
      searchEngine.indexNote(updatedNote);

      stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(1); // 여전히 1개 (업데이트됨)
    });

    test('잘못된 노트 데이터로 인덱싱 시 오류 발생', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      const invalidNote = {
        frontMatter: {
          id: null as any,
          title: null as any,
          category: 'Resources',
          tags: [],
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          links: []
        },
        content: 'test content',
        filePath: '/test/invalid.md'
      };

      expect(() => searchEngine.indexNote(invalidNote as any)).toThrow(IndexingError);
    });
  });

  describe('배치 인덱싱', () => {
    test('여러 노트를 배치로 인덱싱할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNotes = createTestNotes(10);

      const result = searchEngine.batchIndexNotes(testNotes);

      expect(result.successful).toBe(10);
      expect(result.failed).toBe(0);
      expect(result.totalTimeMs).toBeGreaterThan(0);
      expect(result.failures).toHaveLength(0);

      const stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(10);
    });

    test('배치 인덱싱 중 일부 실패해도 계속 처리한다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      const validNotes = createTestNotes(3);
      const invalidNote = {
        frontMatter: {
          id: null as any,
          title: 'Invalid Note',
          category: 'Resources',
          tags: [],
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          links: []
        },
        content: 'invalid content',
        filePath: '/test/invalid.md'
      } as any;

      const mixedNotes = [...validNotes.slice(0, 2), invalidNote, ...validNotes.slice(2)];

      const result = searchEngine.batchIndexNotes(mixedNotes);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].noteUid).toBeNull();

      const stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(3); // 유효한 노트만 인덱싱됨
    });

    test('대량 배치 인덱싱 성능이 합리적이다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const largeDataset = createTestNotes(100);

      const tracker = new PerformanceTracker();
      tracker.start();

      const result = searchEngine.batchIndexNotes(largeDataset);

      const totalTime = tracker.getTotalTime();

      expect(result.successful).toBe(100);
      expect(result.failed).toBe(0);
      expect(totalTime).toBeLessThan(5000); // 5초 이내
      expect(result.totalTimeMs).toBeLessThan(3000); // 3초 이내
    });
  });

  describe('노트 삭제', () => {
    test('노트를 삭제할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNote = createTestNote({ id: 'delete-test' });

      // 인덱싱
      searchEngine.indexNote(testNote);

      let stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(1);

      // 삭제
      searchEngine.removeNote('delete-test');

      stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(0);
    });

    test('존재하지 않는 노트를 삭제해도 오류가 발생하지 않는다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      expect(() => searchEngine.removeNote('non-existing-note')).not.toThrow();
    });

    test('삭제 시 관련 링크도 제거된다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const linkedNotes = createLinkedTestNotes();

      // 모든 노트 인덱싱
      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      let stats = searchEngine.getIndexStats();
      expect(stats.totalLinks).toBeGreaterThan(0);

      // 노트 삭제
      searchEngine.removeNote('note-001');

      stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(3); // 4개 중 1개 삭제됨
      // 링크도 적절히 정리되었는지 확인
      const remainingBacklinks = searchEngine.getBacklinks('note-001');
      expect(remainingBacklinks).toHaveLength(0);
    });
  });

  describe('전문 검색', () => {
    test('기본 텍스트 검색을 수행할 수 있다', async () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNotes = createTestNotes(5);

      testNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const result = await searchEngine.search('테스트');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
      validateSearchResult(result.results);
    });

    test('검색 옵션을 적용할 수 있다', async () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const testNotes = createTestNotes(20);

      testNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const options: SearchOptions = {
        limit: 5,
        offset: 0,
        category: 'Projects',
        snippetLength: 100
      };

      const result = await searchEngine.search('테스트', options);

      expect(result.results.length).toBeLessThanOrEqual(5);
      result.results.forEach(r => {
        expect(r.category).toBe('Projects');
        expect(r.snippet.length).toBeLessThanOrEqual(103); // 100 + "..."
      });
    });

    test('한국어 검색이 정상 작동한다', async () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const koreanNote = createKoreanTestNote();

      searchEngine.indexNote(koreanNote);

      const result = await searchEngine.search('프로젝트');

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].id).toBe('korean-test-note');
    });

    test('빈 쿼리나 잘못된 쿼리를 처리한다', async () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 빈 쿼리
      const emptyResult = await searchEngine.search('');
      expect(emptyResult.results).toHaveLength(0);

      // 특수문자만 포함된 쿼리
      const specialCharResult = await searchEngine.search('!!!@@@###');
      expect(specialCharResult.results).toHaveLength(0);
    });
  });

  describe('링크 관계 조회', () => {
    test('백링크를 조회할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const linkedNotes = createLinkedTestNotes();

      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const backlinks = searchEngine.getBacklinks('note-002');

      expect(backlinks.length).toBeGreaterThan(0);
      backlinks.forEach(link => {
        expect(link).toHaveProperty('targetUid', 'note-002');
        expect(link).toHaveProperty('sourceUid');
        expect(link).toHaveProperty('linkType');
        expect(link).toHaveProperty('strength');
      });
    });

    test('나가는 링크를 조회할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const linkedNotes = createLinkedTestNotes();

      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const outgoingLinks = searchEngine.getOutgoingLinks('note-001');

      expect(outgoingLinks.length).toBeGreaterThan(0);
      outgoingLinks.forEach(link => {
        expect(link).toHaveProperty('sourceUid', 'note-001');
        expect(link).toHaveProperty('targetUid');
      });
    });

    test('백링크 옵션을 적용할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 많은 백링크를 가진 노트 설정
      const targetNote = createTestNote({ id: 'popular-note', title: 'Popular Note' });
      searchEngine.indexNote(targetNote);

      for (let i = 0; i < 10; i++) {
        const sourceNote = createTestNote({
          id: `source-${i}`,
          title: `Source ${i}`,
          content: '[[popular-note]]',
          links: ['popular-note']
        });
        searchEngine.indexNote(sourceNote);
      }

      const options: BacklinkOptions = { limit: 3 };
      const backlinks = searchEngine.getBacklinks('popular-note', options);

      expect(backlinks).toHaveLength(3);
    });
  });

  describe('연결된 노트 탐색', () => {
    test('연결된 노드를 탐색할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const linkedNotes = createLinkedTestNotes();

      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const connectedNodes = searchEngine.getConnectedNodes('note-001');

      expect(connectedNodes.length).toBeGreaterThan(0);
      connectedNodes.forEach(node => {
        expect(node).toHaveProperty('uid');
        expect(node).toHaveProperty('title');
        expect(node).toHaveProperty('category');
        expect(node).toHaveProperty('outgoingLinks');
        expect(node).toHaveProperty('incomingLinks');
      });
    });

    test('연결 탐색 옵션을 적용할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 체인 형태의 링크 구조 생성
      const chainNotes = [
        createTestNote({ id: 'chain-a', title: 'Chain A', content: '[[chain-b]]', links: ['chain-b'] }),
        createTestNote({ id: 'chain-b', title: 'Chain B', content: '[[chain-c]]', links: ['chain-c'] }),
        createTestNote({ id: 'chain-c', title: 'Chain C', content: '[[chain-d]]', links: ['chain-d'] }),
        createTestNote({ id: 'chain-d', title: 'Chain D' })
      ];

      chainNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const options: ConnectedNotesOptions = {
        depth: 2,
        limit: 10,
        direction: 'outgoing'
      };

      const connectedNodes = searchEngine.getConnectedNodes('chain-a', options);

      expect(connectedNodes.length).toBeGreaterThan(0);
      expect(connectedNodes.length).toBeLessThanOrEqual(2); // depth 제한
    });
  });

  describe('고아 노트 감지', () => {
    test('고아 노트를 찾을 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 연결된 노트와 고아 노트 생성
      const orphanNote = createTestNote({
        id: 'orphan-note',
        title: 'Orphan Note',
        content: '독립적인 노트입니다.'
      });

      const connectedNote = createTestNote({
        id: 'connected-note',
        title: 'Connected Note',
        content: '[[target-note]]',
        links: ['target-note']
      });

      const targetNote = createTestNote({
        id: 'target-note',
        title: 'Target Note'
      });

      [orphanNote, connectedNote, targetNote].forEach(note => {
        searchEngine.indexNote(note);
      });

      const orphanNotes = searchEngine.getOrphanNotes();

      expect(orphanNotes.length).toBeGreaterThan(0);
      const orphanUids = orphanNotes.map(note => note.uid);
      expect(orphanUids).toContain('orphan-note');
    });
  });

  describe('인덱스 통계', () => {
    test('인덱스 통계를 조회할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 초기 통계
      let stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(0);
      expect(stats.totalLinks).toBe(0);
      expect(stats.indexSizeBytes).toBeGreaterThan(0);
      expect(stats.lastIndexedAt).toBeDefined();

      // 데이터 추가 후 통계
      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(4);
      expect(stats.totalLinks).toBeGreaterThan(0);
      expect(stats.indexSizeBytes).toBeGreaterThan(0);
    });

    test('통계에서 마지막 인덱싱 시간이 업데이트된다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      const initialStats = searchEngine.getIndexStats();
      const initialLastIndexed = initialStats.lastIndexedAt;

      // 약간의 지연 후 노트 추가
      setTimeout(() => {
        const testNote = createTestNote({ id: 'time-test' });
        searchEngine.indexNote(testNote);

        const updatedStats = searchEngine.getIndexStats();
        expect(new Date(updatedStats.lastIndexedAt).getTime())
          .toBeGreaterThan(new Date(initialLastIndexed).getTime());
      }, 100);
    });
  });

  describe('인덱스 최적화', () => {
    test('인덱스를 최적화할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 데이터 추가
      const testNotes = createTestNotes(10);
      testNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      expect(() => searchEngine.optimize()).not.toThrow();
    });

    test('최적화 후에도 데이터가 유지된다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      const testNotes = createTestNotes(5);
      testNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      const beforeStats = searchEngine.getIndexStats();

      searchEngine.optimize();

      const afterStats = searchEngine.getIndexStats();

      expect(afterStats.totalNotes).toBe(beforeStats.totalNotes);
      expect(afterStats.totalLinks).toBe(beforeStats.totalLinks);
    });
  });

  describe('리소스 관리', () => {
    test('연결을 정상적으로 해제할 수 있다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();

      const searchEngine = createDefaultSearchEngine(dbPath);

      const testNote = createTestNote({ id: 'close-test' });
      searchEngine.indexNote(testNote);

      expect(() => searchEngine.close()).not.toThrow();

      cleanupFn(); // 수동으로 cleanup 호출
      cleanup = null; // 중복 호출 방지
    });

    test('이미 해제된 연결을 다시 해제해도 오류가 발생하지 않는다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();

      const searchEngine = createDefaultSearchEngine(dbPath);

      searchEngine.close();
      expect(() => searchEngine.close()).not.toThrow();

      cleanupFn();
      cleanup = null;
    });
  });

  describe('통합 시나리오', () => {
    test('복잡한 워크플로우를 처리할 수 있다', async () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);

      // 1. 초기 노트 배치 추가
      const initialNotes = createTestNotes(10);
      const batchResult = searchEngine.batchIndexNotes(initialNotes);
      expect(batchResult.successful).toBe(10);

      // 2. 검색 수행
      const searchResult = await searchEngine.search('테스트', { limit: 5 });
      expect(searchResult.results.length).toBeLessThanOrEqual(5);

      // 3. 연결된 노트 추가
      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        searchEngine.indexNote(note);
      });

      // 4. 링크 관계 조회
      const backlinks = searchEngine.getBacklinks('note-002');
      expect(backlinks.length).toBeGreaterThan(0);

      // 5. 연결된 노드 탐색
      const connectedNodes = searchEngine.getConnectedNodes('note-001', { depth: 2 });
      expect(connectedNodes.length).toBeGreaterThan(0);

      // 6. 통계 확인
      const stats = searchEngine.getIndexStats();
      expect(stats.totalNotes).toBe(14); // 10 + 4
      expect(stats.totalLinks).toBeGreaterThan(0);

      // 7. 일부 노트 삭제
      searchEngine.removeNote('note-001');
      const updatedStats = searchEngine.getIndexStats();
      expect(updatedStats.totalNotes).toBe(13);

      // 8. 최적화
      expect(() => searchEngine.optimize()).not.toThrow();

      // 9. 최종 검색으로 모든 기능 확인
      const finalSearch = await searchEngine.search('노트');
      expect(finalSearch.results.length).toBeGreaterThan(0);
    });

    test('성능 중심 시나리오가 정상 작동한다', () => {
      const { dbPath, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const searchEngine = createDefaultSearchEngine(dbPath);
      const tracker = new PerformanceTracker();

      // 대량 데이터 배치 인덱싱
      tracker.start();
      const largeDataset = createLargeTestDataset(500);
      const batchResult = searchEngine.batchIndexNotes(largeDataset);
      tracker.mark('batch_indexing');

      expect(batchResult.successful).toBe(500);
      expect(batchResult.failed).toBe(0);

      // 검색 성능 측정
      const searchPromises = [];
      for (let i = 0; i < 10; i++) {
        searchPromises.push(searchEngine.search(`테스트 ${i}`));
      }

      Promise.all(searchPromises).then(results => {
        tracker.mark('multiple_searches');

        results.forEach(result => {
          expect(result.metrics.totalTimeMs).toBeLessThan(200); // 200ms 이내
        });

        // 전체 성능 확인
        const totalTime = tracker.getTotalTime();
        expect(totalTime).toBeLessThan(10000); // 10초 이내

        const measurements = tracker.getResult();
        expect(measurements.batch_indexing).toBeLessThan(8000); // 8초 이내
        expect(measurements.multiple_searches).toBeLessThan(2000); // 2초 이내
      });
    });
  });
});