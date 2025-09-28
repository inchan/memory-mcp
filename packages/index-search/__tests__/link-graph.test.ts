/**
 * Link Graph 모듈 테스트
 */

import { LinkGraphEngine } from '../src/link-graph';
import { LinkRelation, ConnectedNotesOptions, BacklinkOptions } from '../src/types';
import {
  createTempDatabase,
  createTestNote,
  createLinkedTestNotes,
  afterEachCleanup,
  PerformanceTracker
} from './helpers/test-utils';
import { MarkdownNote } from '@memory-mcp/common';

describe('LinkGraphEngine', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    afterEachCleanup();
  });

  describe('초기화 및 구성', () => {
    test('링크 그래프 엔진을 생성할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      expect(linkGraph).toBeDefined();
    });

    test('생성자에서 준비된 쿼리문들이 초기화된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      expect(() => new LinkGraphEngine(db)).not.toThrow();
    });
  });

  describe('링크 정보 업데이트', () => {
    test('노트의 링크 정보를 업데이트할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 타겟 노트들을 먼저 추가
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES
          ('target-1', 'Target Note 1', 'Resources', '/test/target1.md', 'hash1', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z'),
          ('target-2', 'Target Note 2', 'Resources', '/test/target2.md', 'hash2', '2023-01-02T00:00:00Z', '2023-01-02T00:00:00Z')
      `);

      const sourceNote = createTestNote({
        id: 'source-note',
        title: 'Source Note',
        content: `# Source Note

링크된 노트들:
- [[target-1]]
- [[target-2]]

외부 링크: [Google](https://google.com)
`,
        links: ['target-1', 'target-2']
      });

      expect(() => linkGraph.updateLinksForNote(sourceNote)).not.toThrow();

      // 링크가 생성되었는지 확인
      const links = db.prepare('SELECT * FROM links WHERE source_uid = ?').all('source-note');
      expect(links.length).toBeGreaterThan(0);
    });

    test('중복 링크는 강도로 누적된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 타겟 노트 추가
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('target-note', 'Target Note', 'Resources', '/test/target.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      const noteWithDuplicateLinks = createTestNote({
        id: 'source-with-duplicates',
        title: 'Source with Duplicates',
        content: `# Source Note

여러 번 참조하는 링크:
- [[target-note]]
- [[target-note]]
- [[target-note]]
`,
        links: ['target-note', 'target-note']
      });

      linkGraph.updateLinksForNote(noteWithDuplicateLinks);

      const links = db.prepare('SELECT * FROM links WHERE source_uid = ? AND target_uid = ?')
        .all('source-with-duplicates', 'target-note') as any[];

      expect(links).toHaveLength(1);
      expect(links[0].strength).toBeGreaterThan(1);
    });

    test('업데이트 시 기존 링크가 제거된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 타겟 노트들 추가
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES
          ('target-1', 'Target 1', 'Resources', '/test/target1.md', 'hash1', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z'),
          ('target-2', 'Target 2', 'Resources', '/test/target2.md', 'hash2', '2023-01-02T00:00:00Z', '2023-01-02T00:00:00Z')
      `);

      // 초기 노트 (두 개 링크)
      const initialNote = createTestNote({
        id: 'changing-note',
        title: 'Changing Note',
        content: '[[target-1]] and [[target-2]]',
        links: ['target-1', 'target-2']
      });

      linkGraph.updateLinksForNote(initialNote);

      let linkCount = db.prepare('SELECT COUNT(*) as count FROM links WHERE source_uid = ?')
        .get('changing-note') as { count: number };
      expect(linkCount.count).toBe(2);

      // 업데이트된 노트 (한 개 링크만)
      const updatedNote: MarkdownNote = {
        ...initialNote,
        content: '[[target-1]] only',
        frontMatter: {
          ...initialNote.frontMatter,
          links: ['target-1']
        }
      };

      linkGraph.updateLinksForNote(updatedNote);

      linkCount = db.prepare('SELECT COUNT(*) as count FROM links WHERE source_uid = ?')
        .get('changing-note') as { count: number };
      expect(linkCount.count).toBe(1);

      const remainingLink = db.prepare('SELECT target_uid FROM links WHERE source_uid = ?')
        .get('changing-note') as { target_uid: string };
      expect(remainingLink.target_uid).toBe('target-1');
    });

    test('외부 링크를 올바르게 처리한다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const noteWithExternalLinks = createTestNote({
        id: 'external-links-note',
        title: 'External Links Note',
        content: `# External Links

- [Google](https://google.com)
- [GitHub](https://github.com)
- [MDN](https://developer.mozilla.org)
`
      });

      linkGraph.updateLinksForNote(noteWithExternalLinks);

      const externalLinks = db.prepare(`
        SELECT * FROM links
        WHERE source_uid = ? AND link_type = 'external'
      `).all('external-links-note');

      expect(externalLinks.length).toBeGreaterThan(0);
    });
  });

  describe('링크 관계 조회', () => {
    test('나가는 링크를 조회할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 테스트 데이터 설정
      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      const outgoingLinks = linkGraph.getOutgoingLinks('note-001');

      expect(outgoingLinks.length).toBeGreaterThan(0);
      outgoingLinks.forEach(link => {
        expect(link).toHaveProperty('sourceUid', 'note-001');
        expect(link).toHaveProperty('targetUid');
        expect(link).toHaveProperty('linkType');
        expect(link).toHaveProperty('strength');
        expect(typeof link.strength).toBe('number');
      });
    });

    test('백링크를 조회할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      const backlinks = linkGraph.getBacklinks('note-002');

      expect(backlinks.length).toBeGreaterThan(0);
      backlinks.forEach(link => {
        expect(link).toHaveProperty('targetUid', 'note-002');
        expect(link).toHaveProperty('sourceUid');
      });
    });

    test('백링크 조회 시 제한 옵션이 적용된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 많은 백링크를 가진 노트 설정
      const targetNote = createTestNote({ id: 'popular-note', title: 'Popular Note' });
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('popular-note', 'Popular Note', 'Resources', '/test/popular.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      // 여러 소스 노트에서 참조
      for (let i = 0; i < 10; i++) {
        const sourceNote = createTestNote({
          id: `source-${i}`,
          title: `Source ${i}`,
          content: '[[popular-note]]',
          links: ['popular-note']
        });
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('source-${i}', 'Source ${i}', 'Resources', '/test/source${i}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(sourceNote);
      }

      const options: BacklinkOptions = { limit: 3 };
      const backlinks = linkGraph.getBacklinks('popular-note', options);

      expect(backlinks).toHaveLength(3);
    });
  });

  describe('연결된 노트 탐색', () => {
    test('연결된 노드를 탐색할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      const connectedNodes = linkGraph.getConnectedNodes('note-001');

      expect(connectedNodes.length).toBeGreaterThan(0);
      connectedNodes.forEach(node => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('title');
        expect(node).toHaveProperty('category');
        expect(node).toHaveProperty('outgoingLinks');
        expect(node).toHaveProperty('incomingLinks');
        expect(Array.isArray(node.outgoingLinks)).toBe(true);
        expect(Array.isArray(node.incomingLinks)).toBe(true);
      });
    });

    test('탐색 깊이 옵션이 적용된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 체인 형태의 링크 구조 생성: A -> B -> C -> D
      const chainNotes = [
        createTestNote({ id: 'chain-a', title: 'Chain A', content: '[[chain-b]]', links: ['chain-b'] }),
        createTestNote({ id: 'chain-b', title: 'Chain B', content: '[[chain-c]]', links: ['chain-c'] }),
        createTestNote({ id: 'chain-c', title: 'Chain C', content: '[[chain-d]]', links: ['chain-d'] }),
        createTestNote({ id: 'chain-d', title: 'Chain D' })
      ];

      chainNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      // 깊이 1로 탐색
      const depth1Nodes = linkGraph.getConnectedNodes('chain-a', { depth: 1 });
      const depth1Uids = depth1Nodes.map(n => n.id);
      expect(depth1Uids).toContain('chain-b');
      expect(depth1Uids).not.toContain('chain-c');

      // 깊이 2로 탐색
      const depth2Nodes = linkGraph.getConnectedNodes('chain-a', { depth: 2 });
      const depth2Uids = depth2Nodes.map(n => n.id);
      expect(depth2Uids).toContain('chain-b');
      expect(depth2Uids).toContain('chain-c');
    });

    test('방향 옵션이 적용된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      // 나가는 링크만
      const outgoingOnly = linkGraph.getConnectedNodes('note-001', { direction: 'outgoing' });
      expect(outgoingOnly.length).toBeGreaterThan(0);

      // 들어오는 링크만
      const incomingOnly = linkGraph.getConnectedNodes('note-002', { direction: 'incoming' });
      expect(incomingOnly.length).toBeGreaterThan(0);

      // 양방향
      const bothDirections = linkGraph.getConnectedNodes('note-002', { direction: 'both' });
      expect(bothDirections.length).toBeGreaterThanOrEqual(Math.max(outgoingOnly.length, incomingOnly.length));
    });
  });

  describe('고아 노트 감지', () => {
    test('고아 노트를 찾을 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 연결된 노트들과 고아 노트 생성
      const orphanNote = createTestNote({
        id: 'orphan-note',
        title: 'Orphan Note',
        content: '독립적인 노트입니다.'
      });

      const connectedNote = createTestNote({
        id: 'connected-note',
        title: 'Connected Note',
        content: '[[orphan-note]]',
        links: ['orphan-note']
      });

      [orphanNote, connectedNote].forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
      });

      // connected-note의 링크만 업데이트 (orphan-note는 실제로는 고아가 아님)
      linkGraph.updateLinksForNote(connectedNote);

      const orphanNotes = linkGraph.getOrphanNotes();

      // connected-note에서 orphan-note를 참조하므로 orphan-note는 고아가 아님
      const orphanUids = orphanNotes.map(note => note.uid);
      expect(orphanUids).toContain('connected-note'); // 참조받지 않는 노트
      expect(orphanUids).not.toContain('orphan-note'); // 참조받는 노트
    });

    test('완전한 고아 노트를 식별한다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 완전히 독립적인 고아 노트
      const trueOrphan = createTestNote({
        id: 'true-orphan',
        title: 'True Orphan',
        content: '완전히 독립적인 노트입니다.'
      });

      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('true-orphan', 'True Orphan', 'Resources', '/test/orphan.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      const orphanNotes = linkGraph.getOrphanNotes();

      expect(orphanNotes.length).toBe(1);
      expect(orphanNotes[0].uid).toBe('true-orphan');
      expect(orphanNotes[0]).toHaveProperty('title', 'True Orphan');
      expect(orphanNotes[0]).toHaveProperty('filePath');
      expect(orphanNotes[0]).toHaveProperty('createdAt');
      expect(orphanNotes[0]).toHaveProperty('updatedAt');
    });
  });

  describe('링크 제거', () => {
    test('소스 노트의 모든 링크를 제거할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      // 제거 전 링크 확인
      let linkCount = db.prepare('SELECT COUNT(*) as count FROM links WHERE source_uid = ?')
        .get('note-001') as { count: number };
      expect(linkCount.count).toBeGreaterThan(0);

      // 소스 링크 제거
      linkGraph.removeLinksForSource('note-001');

      // 제거 후 확인
      linkCount = db.prepare('SELECT COUNT(*) as count FROM links WHERE source_uid = ?')
        .get('note-001') as { count: number };
      expect(linkCount.count).toBe(0);
    });

    test('타겟 노트로 향하는 모든 링크를 제거할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      const linkedNotes = createLinkedTestNotes();
      linkedNotes.forEach(note => {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('${note.frontMatter.id}', '${note.frontMatter.title}', '${note.frontMatter.category}', '/test/${note.frontMatter.id}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
        linkGraph.updateLinksForNote(note);
      });

      // 제거 전 백링크 확인
      let backlinks = linkGraph.getBacklinks('note-002');
      expect(backlinks.length).toBeGreaterThan(0);

      // 타겟 링크 제거
      linkGraph.removeLinksToTarget('note-002');

      // 제거 후 확인
      backlinks = linkGraph.getBacklinks('note-002');
      expect(backlinks.length).toBe(0);
    });
  });

  describe('성능 테스트', () => {
    test('대량 링크 업데이트 성능이 합리적이다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 대량 노트 생성 (100개)
      for (let i = 0; i < 100; i++) {
        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('note-${i}', 'Note ${i}', 'Resources', '/test/note${i}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);
      }

      const tracker = new PerformanceTracker();
      tracker.start();

      // 많은 링크를 가진 노트 생성
      const manyLinksNote = createTestNote({
        id: 'many-links',
        title: 'Many Links Note',
        content: Array.from({ length: 50 }, (_, i) => `[[note-${i}]]`).join(' '),
        links: Array.from({ length: 50 }, (_, i) => `note-${i}`)
      });

      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('many-links', 'Many Links Note', 'Resources', '/test/many-links.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      linkGraph.updateLinksForNote(manyLinksNote);

      const updateTime = tracker.getTotalTime();

      expect(updateTime).toBeLessThan(1000); // 1초 이내

      const linkCount = db.prepare('SELECT COUNT(*) as count FROM links WHERE source_uid = ?')
        .get('many-links') as { count: number };
      expect(linkCount.count).toBe(50);
    });

    test('깊은 그래프 탐색 성능이 합리적이다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 깊은 체인 구조 생성 (depth 10)
      for (let i = 0; i < 10; i++) {
        const note = createTestNote({
          id: `deep-${i}`,
          title: `Deep Note ${i}`,
          content: i < 9 ? `[[deep-${i + 1}]]` : 'End of chain',
          links: i < 9 ? [`deep-${i + 1}`] : []
        });

        db.exec(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES ('deep-${i}', 'Deep Note ${i}', 'Resources', '/test/deep${i}.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
        `);

        linkGraph.updateLinksForNote(note);
      }

      const tracker = new PerformanceTracker();
      tracker.start();

      const connectedNodes = linkGraph.getConnectedNodes('deep-0', { depth: 5 });

      const searchTime = tracker.getTotalTime();

      expect(searchTime).toBeLessThan(500); // 500ms 이내
      expect(connectedNodes.length).toBeGreaterThan(0);
      expect(connectedNodes.length).toBeLessThanOrEqual(5); // depth 제한 확인
    });
  });

  describe('링크 해결 (Resolution)', () => {
    test('UID로 링크를 해결할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 타겟 노트 생성
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('target-uid', 'Target Note', 'Resources', '/test/target.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      const sourceNote = createTestNote({
        id: 'source-note',
        title: 'Source Note',
        content: '[[target-uid]]',
        links: ['target-uid']
      });

      linkGraph.updateLinksForNote(sourceNote);

      const outgoingLinks = linkGraph.getOutgoingLinks('source-note');
      expect(outgoingLinks.length).toBe(1);
      expect(outgoingLinks[0].targetUid).toBe('target-uid');
    });

    test('제목으로 링크를 해결할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const linkGraph = new LinkGraphEngine(db);

      // 타겟 노트 생성
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES ('target-note-uid', 'Target Note Title', 'Resources', '/test/target.md', 'hash', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z')
      `);

      const sourceNote = createTestNote({
        id: 'source-note',
        title: 'Source Note',
        content: '[[Target Note Title]]',
        links: ['Target Note Title']
      });

      linkGraph.updateLinksForNote(sourceNote);

      const outgoingLinks = linkGraph.getOutgoingLinks('source-note');
      expect(outgoingLinks.length).toBe(1);
      expect(outgoingLinks[0].targetUid).toBe('target-note-uid');
    });
  });
});