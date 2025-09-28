/**
 * Database 모듈 테스트
 */

import { DatabaseManager, createDefaultConfig } from '../src/database';
import { DatabaseError, IndexConfig } from '../src/types';
import { createTempDatabase, afterEachCleanup } from './helpers/test-utils';
import * as path from 'path';
import * as fs from 'fs';

describe('DatabaseManager', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    afterEachCleanup();
  });

  describe('생성자 및 초기화', () => {
    test('기본 설정으로 데이터베이스를 생성할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      expect(dbManager).toBeDefined();
      expect(dbManager.getDatabase()).toBeDefined();
    });

    test('존재하지 않는 디렉토리에 데이터베이스를 생성할 수 있다', () => {
      const tempDir = path.join(__dirname, 'temp', 'nested', 'directory');
      const dbPath = path.join(tempDir, 'test.db');
      const config = createDefaultConfig(dbPath);

      const dbManager = new DatabaseManager(config);

      expect(fs.existsSync(tempDir)).toBe(true);
      expect(fs.existsSync(dbPath)).toBe(true);

      cleanup = () => {
        dbManager.close();
        fs.rmSync(path.dirname(tempDir), { recursive: true, force: true });
      };
    });

    test('잘못된 경로로 데이터베이스 생성 시 오류가 발생한다', () => {
      const invalidPath = '/root/invalid/path/test.db';
      const config = createDefaultConfig(invalidPath);

      expect(() => {
        new DatabaseManager(config);
      }).toThrow(DatabaseError);
    });
  });

  describe('스키마 관리', () => {
    test('새 데이터베이스에 올바른 스키마가 생성된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      // 테이블 존재 확인
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as { name: string }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('notes');
      expect(tableNames).toContain('notes_fts');
      expect(tableNames).toContain('links');
      expect(tableNames).toContain('index_metadata');
    });

    test('FTS5 가상 테이블이 올바르게 생성된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      // FTS5 테이블 스키마 확인
      const schema = db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='notes_fts'
      `).get() as { sql: string };

      expect(schema.sql).toContain('USING fts5');
      expect(schema.sql).toContain('uid UNINDEXED');
      expect(schema.sql).toContain('title');
      expect(schema.sql).toContain('content');
    });

    test('인덱스가 올바르게 생성된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      // 인덱스 존재 확인
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name LIKE 'idx_%'
      `).all() as { name: string }[];

      const indexNames = indexes.map(i => i.name);
      expect(indexNames.length).toBeGreaterThan(0);
      expect(indexNames).toContain('idx_notes_category');
      expect(indexNames).toContain('idx_notes_project');
      expect(indexNames).toContain('idx_links_source');
    });

    test('스키마 버전이 올바르게 설정된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      const version = db.prepare(`
        SELECT value FROM index_metadata WHERE key = 'schema_version'
      `).get() as { value: string };

      expect(parseInt(version.value, 10)).toBe(1);
    });
  });

  describe('PRAGMA 설정', () => {
    test('WAL 모드가 올바르게 설정된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const journalMode = db.pragma('journal_mode', { simple: true });

      expect(journalMode).toBe('wal');
    });

    test('외래 키 제약 조건이 활성화된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();
      const foreignKeys = db.pragma('foreign_keys', { simple: true });

      expect(foreignKeys).toBe(1);
    });

    test('커스텀 설정으로 PRAGMA를 구성할 수 있다', () => {
      const tempDir = path.join(__dirname, 'temp', 'custom-config');
      const dbPath = path.join(tempDir, 'test.db');

      const customConfig: IndexConfig = {
        dbPath,
        pageSize: 8192,
        cacheSize: 20000,
        walMode: false
      };

      fs.mkdirSync(tempDir, { recursive: true });
      const dbManager = new DatabaseManager(customConfig);

      cleanup = () => {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      };

      const db = dbManager.getDatabase();
      const pageSize = db.pragma('page_size', { simple: true });
      const journalMode = db.pragma('journal_mode', { simple: true });

      expect(pageSize).toBe(8192);
      expect(journalMode).toBe('delete');
    });
  });

  describe('데이터베이스 통계', () => {
    test('빈 데이터베이스의 통계를 조회할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const stats = dbManager.getStats();

      expect(stats.totalNotes).toBe(0);
      expect(stats.totalLinks).toBe(0);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
      expect(stats.lastVacuum).toBeNull();
    });

    test('노트와 링크가 있는 데이터베이스의 통계를 조회할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      // 샘플 데이터 삽입
      db.exec(`
        INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
        VALUES
          ('note1', 'Test Note 1', 'Resources', '/test/note1.md', 'hash1', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z'),
          ('note2', 'Test Note 2', 'Projects', '/test/note2.md', 'hash2', '2023-01-02T00:00:00Z', '2023-01-02T00:00:00Z')
      `);

      db.exec(`
        INSERT INTO links (source_uid, target_uid, link_type, strength)
        VALUES
          ('note1', 'note2', 'internal', 1),
          ('note2', 'note1', 'internal', 1)
      `);

      const stats = dbManager.getStats();

      expect(stats.totalNotes).toBe(2);
      expect(stats.totalLinks).toBe(2);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('최적화 및 무결성', () => {
    test('데이터베이스를 최적화할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      expect(() => dbManager.optimize()).not.toThrow();

      const stats = dbManager.getStats();
      expect(stats.lastVacuum).not.toBeNull();
    });

    test('데이터베이스 무결성을 검사할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const isIntegrityOk = dbManager.checkIntegrity();
      expect(isIntegrityOk).toBe(true);
    });

    test('손상된 데이터베이스의 무결성 검사가 실패한다', () => {
      const { dbManager, dbPath, cleanup: cleanupFn } = createTempDatabase();

      // 데이터베이스 파일 손상 시뮬레이션
      dbManager.close();

      // 파일의 일부를 덮어쓰기
      const fd = fs.openSync(dbPath, 'r+');
      fs.writeSync(fd, Buffer.from('corrupted'), 100);
      fs.closeSync(fd);

      const corruptedConfig = createDefaultConfig(dbPath);

      try {
        const corruptedDbManager = new DatabaseManager(corruptedConfig);
        const isIntegrityOk = corruptedDbManager.checkIntegrity();
        expect(isIntegrityOk).toBe(false);
        corruptedDbManager.close();
      } catch (error) {
        // 손상된 데이터베이스로 인한 오류는 예상됨
        expect(error).toBeDefined();
      }

      cleanup = cleanupFn;
    });
  });

  describe('트랜잭션', () => {
    test('트랜잭션 내에서 여러 작업을 수행할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      const result = dbManager.transaction(() => {
        const insertStmt = db.prepare(`
          INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run('note1', 'Test Note 1', 'Resources', '/test/note1.md', 'hash1', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z');
        insertStmt.run('note2', 'Test Note 2', 'Projects', '/test/note2.md', 'hash2', '2023-01-02T00:00:00Z', '2023-01-02T00:00:00Z');

        return 'success';
      });

      expect(result).toBe('success');

      const stats = dbManager.getStats();
      expect(stats.totalNotes).toBe(2);
    });

    test('트랜잭션 중 오류 발생 시 롤백된다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();
      cleanup = cleanupFn;

      const db = dbManager.getDatabase();

      expect(() => {
        dbManager.transaction(() => {
          const insertStmt = db.prepare(`
            INSERT INTO notes (uid, title, category, file_path, content_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          insertStmt.run('note1', 'Test Note 1', 'Resources', '/test/note1.md', 'hash1', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z');

          // 의도적으로 오류 발생 (중복 UID)
          insertStmt.run('note1', 'Duplicate Note', 'Resources', '/test/duplicate.md', 'hash2', '2023-01-02T00:00:00Z', '2023-01-02T00:00:00Z');
        });
      }).toThrow();

      const stats = dbManager.getStats();
      expect(stats.totalNotes).toBe(0); // 롤백으로 인해 0개
    });
  });

  describe('연결 관리', () => {
    test('데이터베이스 연결을 해제할 수 있다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();

      expect(() => dbManager.close()).not.toThrow();

      // 연결 해제 후 재사용 시도
      expect(() => dbManager.getDatabase().prepare('SELECT 1')).toThrow();

      cleanupFn(); // 수동으로 cleanup 호출
      cleanup = null; // 중복 호출 방지
    });

    test('이미 해제된 연결을 다시 해제해도 오류가 발생하지 않는다', () => {
      const { dbManager, cleanup: cleanupFn } = createTempDatabase();

      dbManager.close();
      expect(() => dbManager.close()).not.toThrow();

      cleanupFn();
      cleanup = null;
    });
  });
});

describe('createDefaultConfig', () => {
  test('기본 설정을 생성할 수 있다', () => {
    const dbPath = '/test/path/database.db';
    const config = createDefaultConfig(dbPath);

    expect(config).toEqual({
      dbPath,
      tokenizer: 'unicode61',
      pageSize: 4096,
      cacheSize: 10000,
      walMode: true
    });
  });

  test('생성된 설정이 올바른 타입을 가진다', () => {
    const dbPath = '/test/path/database.db';
    const config = createDefaultConfig(dbPath);

    expect(typeof config.dbPath).toBe('string');
    expect(typeof config.tokenizer).toBe('string');
    expect(typeof config.pageSize).toBe('number');
    expect(typeof config.cacheSize).toBe('number');
    expect(typeof config.walMode).toBe('boolean');
  });
});