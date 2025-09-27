/**
 * SQLite 데이터베이스 스키마 관리 및 초기화
 */

import DatabaseConstructor from 'better-sqlite3';
import { logger } from '@memory-mcp/common';
import { IndexConfig, DatabaseError } from './types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 데이터베이스 스키마 버전
 */
const SCHEMA_VERSION = 1;

/**
 * 데이터베이스 관리자 클래스
 */
export type SqliteDatabase = InstanceType<typeof DatabaseConstructor>;

export class DatabaseManager {
  private db: SqliteDatabase;
  private readonly config: IndexConfig;

  constructor(config: IndexConfig) {
    this.config = config;

    // 디렉토리 생성
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 데이터베이스 연결
    this.db = new DatabaseConstructor(config.dbPath);
    this.initialize();
  }

  /**
   * 데이터베이스 초기화 및 구성
   */
  private initialize(): void {
    try {
      logger.debug('데이터베이스 초기화 시작', { dbPath: this.config.dbPath });

      // 실용적인 설정 적용
      this.configurePragmas();

      // 스키마 생성 또는 마이그레이션
      this.ensureSchema();

      logger.info('데이터베이스 초기화 완료');
    } catch (error) {
      throw new DatabaseError('데이터베이스 초기화 실패', error);
    }
  }

  /**
   * SQLite PRAGMA 설정
   */
  private configurePragmas(): void {
    const {
      pageSize = 4096,
      cacheSize = 10000, // 10MB
      walMode = true
    } = this.config;

    try {
      // 성능 최적화 설정
      this.db.pragma(`page_size = ${pageSize}`);
      this.db.pragma(`cache_size = -${cacheSize}`); // KB 단위로 설정
      this.db.pragma('temp_store = memory');
      this.db.pragma('mmap_size = 268435456'); // 256MB

      // WAL 모드 (동시성 개선)
      if (walMode) {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
      } else {
        this.db.pragma('journal_mode = DELETE');
        this.db.pragma('synchronous = FULL');
      }

      // 외래 키 제약 조건 활성화
      this.db.pragma('foreign_keys = ON');

      logger.debug('PRAGMA 설정 완료', {
        pageSize,
        cacheSize,
        walMode
      });

    } catch (error) {
      throw new DatabaseError('PRAGMA 설정 실패', error);
    }
  }

  /**
   * 스키마 버전 확인 및 마이그레이션
   */
  private ensureSchema(): void {
    try {
      // 메타데이터 테이블 생성 (버전 관리용)
      this.createMetadataTable();

      const currentVersion = this.getSchemaVersion();

      if (currentVersion === 0) {
        // 새 데이터베이스 - 스키마 생성
        logger.info('새 데이터베이스 감지 - 스키마 생성');
        this.createSchema();
        this.setSchemaVersion(SCHEMA_VERSION);
      } else if (currentVersion < SCHEMA_VERSION) {
        // 기존 데이터베이스 - 마이그레이션
        logger.info(`스키마 마이그레이션 필요: v${currentVersion} → v${SCHEMA_VERSION}`);
        this.migrateSchema(currentVersion, SCHEMA_VERSION);
      } else if (currentVersion > SCHEMA_VERSION) {
        throw new DatabaseError(
          `지원하지 않는 스키마 버전: v${currentVersion} (현재 지원: v${SCHEMA_VERSION})`
        );
      }

      logger.debug(`스키마 버전: v${this.getSchemaVersion()}`);

    } catch (error) {
      throw new DatabaseError('스키마 확인/마이그레이션 실패', error);
    }
  }

  /**
   * 메타데이터 테이블 생성
   */
  private createMetadataTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * 전체 스키마 생성
   */
  private createSchema(): void {
    const transaction = this.db.transaction(() => {
      // 노트 메타데이터 테이블
      this.db.exec(`
        CREATE TABLE notes (
          uid TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          project TEXT,
          tags TEXT, -- JSON 배열로 저장
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // FTS5 가상 테이블 (전문 검색)
      this.db.exec(`
        CREATE VIRTUAL TABLE notes_fts USING fts5(
          uid UNINDEXED,
          title,
          content,
          tags,
          category UNINDEXED,
          project UNINDEXED,
          content=''
        )
      `);

      // 링크 관계 테이블
      this.db.exec(`
        CREATE TABLE links (
          source_uid TEXT NOT NULL,
          target_uid TEXT NOT NULL,
          link_type TEXT NOT NULL DEFAULT 'internal',
          strength INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (source_uid, target_uid, link_type),
          FOREIGN KEY (source_uid) REFERENCES notes(uid) ON DELETE CASCADE
        )
      `);

      // 인덱스 생성
      this.createIndexes();

      logger.info('데이터베이스 스키마 생성 완료');
    });

    transaction();
  }

  /**
   * 인덱스 생성
   */
  private createIndexes(): void {
    // 자주 사용되는 쿼리 패턴에 대한 인덱스
    const indexes = [
      'CREATE INDEX idx_notes_category ON notes(category)',
      'CREATE INDEX idx_notes_project ON notes(project)',
      'CREATE INDEX idx_notes_updated_at ON notes(updated_at)',
      'CREATE INDEX idx_notes_indexed_at ON notes(indexed_at)',
      'CREATE INDEX idx_links_source ON links(source_uid)',
      'CREATE INDEX idx_links_target ON links(target_uid)',
      'CREATE INDEX idx_links_type ON links(link_type)',
      'CREATE INDEX idx_links_strength ON links(strength)',
      'CREATE INDEX idx_links_last_seen ON links(last_seen_at)'
    ];

    for (const indexSql of indexes) {
      this.db.exec(indexSql);
    }

    logger.debug(`${indexes.length}개 인덱스 생성 완료`);
  }

  /**
   * 스키마 마이그레이션 (미래 버전 대비)
   */
  private migrateSchema(fromVersion: number, toVersion: number): void {
    logger.info(`스키마 마이그레이션: v${fromVersion} → v${toVersion}`);

    const transaction = this.db.transaction(() => {
      // 향후 마이그레이션 로직이 여기에 들어갑니다
      for (let version = fromVersion; version < toVersion; version++) {
        this.migrateToVersion(version + 1);
      }

      this.setSchemaVersion(toVersion);
    });

    transaction();
  }

  /**
   * 특정 버전으로 마이그레이션
   */
  private migrateToVersion(version: number): void {
    switch (version) {
      case 1:
        // 초기 버전 - 마이그레이션 없음
        break;
      // 향후 버전들의 마이그레이션 로직이 여기에 추가됩니다
      default:
        throw new DatabaseError(`알 수 없는 마이그레이션 버전: v${version}`);
    }
  }

  /**
   * 현재 스키마 버전 조회
   */
  private getSchemaVersion(): number {
    try {
      const stmt = this.db.prepare(`
        SELECT value FROM index_metadata WHERE key = 'schema_version'
      `);
      const result = stmt.get() as { value: string } | undefined;
      return result ? parseInt(result.value, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 스키마 버전 설정
   */
  private setSchemaVersion(version: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO index_metadata (key, value, updated_at)
      VALUES ('schema_version', ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(version.toString());
  }

  /**
   * 데이터베이스 연결 반환
   */
  public getDatabase(): SqliteDatabase {
    return this.db;
  }

  /**
   * 데이터베이스 통계 조회
   */
  public getStats(): {
    totalNotes: number;
    totalLinks: number;
    dbSizeBytes: number;
    lastVacuum: string | null;
  } {
    try {
      const notesCount = this.db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number };
      const linksCount = this.db.prepare('SELECT COUNT(*) as count FROM links').get() as { count: number };

      // 데이터베이스 파일 크기
      const stats = fs.statSync(this.config.dbPath);

      // 마지막 VACUUM 시간 조회
      const vacuumStmt = this.db.prepare(`
        SELECT value FROM index_metadata WHERE key = 'last_vacuum'
      `);
      const vacuumResult = vacuumStmt.get() as { value: string } | undefined;

      return {
        totalNotes: notesCount.count,
        totalLinks: linksCount.count,
        dbSizeBytes: stats.size,
        lastVacuum: vacuumResult?.value || null
      };

    } catch (error) {
      throw new DatabaseError('데이터베이스 통계 조회 실패', error);
    }
  }

  /**
   * 데이터베이스 최적화 (VACUUM)
   */
  public optimize(): void {
    try {
      logger.info('데이터베이스 최적화 시작');

      const startTime = Date.now();

      // FTS 인덱스 최적화
      this.db.exec("INSERT INTO notes_fts(notes_fts) VALUES('optimize')");

      // 데이터베이스 압축
      this.db.exec('VACUUM');

      // 최적화 시간 기록
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO index_metadata (key, value, updated_at)
        VALUES ('last_vacuum', ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(new Date().toISOString());

      const duration = Date.now() - startTime;
      logger.info(`데이터베이스 최적화 완료 (${duration}ms)`);

    } catch (error) {
      throw new DatabaseError('데이터베이스 최적화 실패', error);
    }
  }

  /**
   * 데이터베이스 무결성 검사
   */
  public checkIntegrity(): boolean {
    try {
      const result = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      return result.integrity_check === 'ok';
    } catch (error) {
      logger.error('데이터베이스 무결성 검사 실패', error);
      return false;
    }
  }

  /**
   * 트랜잭션 실행
   */
  public transaction<T>(fn: () => T): T {
    const transactionFn = this.db.transaction(fn);
    return transactionFn();
  }

  /**
   * 데이터베이스 연결 해제
   */
  public close(): void {
    try {
      if (this.db) {
        this.db.close();
        logger.debug('데이터베이스 연결 해제 완료');
      }
    } catch (error) {
      logger.error('데이터베이스 연결 해제 실패', error);
    }
  }
}

/**
 * 기본 인덱스 설정 생성
 */
export function createDefaultConfig(dbPath: string): IndexConfig {
  return {
    dbPath,
    tokenizer: 'unicode61',
    pageSize: 4096,
    cacheSize: 10000, // 10MB
    walMode: true
  };
}