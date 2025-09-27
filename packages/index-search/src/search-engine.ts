/**
 * 통합 인덱스 & 검색 엔진
 */

import { logger, MarkdownNote, normalizePath, IndexStats } from '@memory-mcp/common';
import type { LinkGraphNode } from '@memory-mcp/common';
import { createHash } from 'crypto';
import { DatabaseManager, type SqliteDatabase } from './database';
import { FtsSearchEngine } from './fts-index';
import { LinkGraphEngine } from './link-graph';
import type {
  IndexConfig,
  BatchIndexResult,
  SearchOptions,
  EnhancedSearchResult,
  BacklinkOptions,
  ConnectedNotesOptions,
  LinkRelation,
  OrphanNote,
} from './types';
import { IndexingError } from './types';

const EMPTY_INDEXED_AT = new Date(0).toISOString();

type Statement = ReturnType<SqliteDatabase['prepare']>;

type NoteStatsRow = {
  totalNotes: number;
  lastIndexedAt: string | null;
};

type CountRow = {
  totalLinks: number;
};

/**
 * 검색 엔진 최상위 퍼사드
 */
export class IndexSearchEngine {
  private readonly manager: DatabaseManager;
  private readonly db: SqliteDatabase;
  private readonly fts: FtsSearchEngine;
  private readonly graph: LinkGraphEngine;

  private readonly upsertNoteStmt: Statement;
  private readonly deleteNoteStmt: Statement;
  private readonly noteStatsStmt: Statement;
  private readonly linkCountStmt: Statement;

  constructor(config: IndexConfig) {
    this.manager = new DatabaseManager(config);
    this.db = this.manager.getDatabase();

    this.fts = new FtsSearchEngine(this.db);
    this.graph = new LinkGraphEngine(this.db);

    this.upsertNoteStmt = this.db.prepare(`
      INSERT INTO notes (
        uid,
        title,
        category,
        file_path,
        project,
        tags,
        content_hash,
        created_at,
        updated_at,
        indexed_at
      ) VALUES (
        @uid,
        @title,
        @category,
        @filePath,
        @project,
        @tags,
        @contentHash,
        @createdAt,
        @updatedAt,
        @indexedAt
      )
      ON CONFLICT(uid) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        file_path = excluded.file_path,
        project = excluded.project,
        tags = excluded.tags,
        content_hash = excluded.content_hash,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        indexed_at = excluded.indexed_at
    `);

    this.deleteNoteStmt = this.db.prepare(`
      DELETE FROM notes WHERE uid = ?
    `);

    this.noteStatsStmt = this.db.prepare(`
      SELECT COUNT(*) as totalNotes, MAX(indexed_at) as lastIndexedAt
      FROM notes
    `);

    this.linkCountStmt = this.db.prepare(`
      SELECT COUNT(*) as totalLinks FROM links
    `);
  }

  /**
   * 노트를 인덱싱합니다.
   */
  indexNote(note: MarkdownNote): void {
    try {
      const tx = this.db.transaction(() => {
        this.persistNoteMetadata(note);
        this.fts.updateNote(note);
        this.graph.updateLinksForNote(note);
      });

      tx();
      logger.debug('노트 인덱싱 완료', { uid: note.frontMatter.id });
    } catch (error) {
      logger.error('노트 인덱싱 실패', { uid: note.frontMatter.id, error });
      throw new IndexingError(`노트 인덱싱 실패: ${note.frontMatter.id}`, error);
    }
  }

  /**
   * 노트 삭제를 처리합니다.
   */
  removeNote(noteUid: string): void {
    try {
      const tx = this.db.transaction(() => {
        this.deleteNoteStmt.run(noteUid);
        this.fts.removeNote(noteUid);
        this.graph.removeLinksForSource(noteUid);
        this.graph.removeLinksToTarget(noteUid);
      });

      tx();
      logger.debug('노트 삭제 인덱스 반영 완료', { uid: noteUid });
    } catch (error) {
      logger.error('노트 삭제 처리 실패', { uid: noteUid, error });
      throw new IndexingError(`노트 삭제 실패: ${noteUid}`, error);
    }
  }

  /**
   * 여러 노트를 배치 인덱싱합니다.
   */
  batchIndexNotes(notes: MarkdownNote[]): BatchIndexResult {
    const failures: BatchIndexResult['failures'] = [];
    let successful = 0;
    const start = Date.now();

    for (const note of notes) {
      try {
        this.indexNote(note);
        successful += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({
          noteUid: note.frontMatter.id,
          error: message,
        });
      }
    }

    return {
      successful,
      failed: failures.length,
      totalTimeMs: Date.now() - start,
      failures,
    };
  }

  /**
   * 전문 검색을 수행합니다.
   */
  async search(query: string, options: SearchOptions = {}): Promise<EnhancedSearchResult> {
    return this.fts.searchNotes(query, options);
  }

  /**
   * 백링크를 조회합니다.
   */
  getBacklinks(targetUid: string, options: BacklinkOptions = {}): LinkRelation[] {
    return this.graph.getBacklinks(targetUid, options);
  }

  /**
   * 아웃바운드 링크를 조회합니다.
   */
  getOutgoingLinks(sourceUid: string): LinkRelation[] {
    return this.graph.getOutgoingLinks(sourceUid);
  }

  /**
   * 연결된 노트들을 탐색합니다.
   */
  getConnectedNodes(startUid: string, options: ConnectedNotesOptions = {}): LinkGraphNode[] {
    return this.graph.getConnectedNodes(startUid, options);
  }

  /**
   * 고아 노트 목록을 반환합니다.
   */
  getOrphanNotes(): OrphanNote[] {
    return this.graph.getOrphanNotes();
  }

  /**
   * 인덱스 통계를 조회합니다.
   */
  getIndexStats(): IndexStats {
    const dbStats = this.manager.getStats();
    const noteStats = (this.noteStatsStmt as any).get() as NoteStatsRow;
    const linkStats = (this.linkCountStmt as any).get() as CountRow;

    return {
      totalNotes: noteStats.totalNotes,
      totalLinks: linkStats.totalLinks,
      lastIndexedAt: noteStats.lastIndexedAt ?? EMPTY_INDEXED_AT,
      indexSizeBytes: dbStats.dbSizeBytes,
    };
  }

  /**
   * 인덱스를 최적화합니다.
   */
  optimize(): void {
    this.fts.optimize();
    this.manager.optimize();
  }

  /**
   * 리소스를 정리합니다.
   */
  close(): void {
    this.fts.cleanup();
    this.manager.close();
  }

  private persistNoteMetadata(note: MarkdownNote): void {
    const tagsJson = JSON.stringify(note.frontMatter.tags ?? []);
    const project = note.frontMatter.project ?? null;

    this.upsertNoteStmt.run({
      uid: note.frontMatter.id,
      title: note.frontMatter.title,
      category: note.frontMatter.category,
      filePath: normalizePath(note.filePath),
      project,
      tags: tagsJson,
      contentHash: this.computeContentHash(note),
      createdAt: note.frontMatter.created,
      updatedAt: note.frontMatter.updated,
      indexedAt: new Date().toISOString(),
    });
  }

  private computeContentHash(note: MarkdownNote): string {
    return createHash('sha256')
      .update(note.frontMatter.title)
      .update('\n')
      .update(note.content)
      .digest('hex');
  }
}
