/**
 * 통합 검색 엔진
 * FTS와 링크 그래프를 결합한 하이브리드 검색 제공
 */

// Database import removed as it's not used directly
import { logger, SearchResult, LinkGraphNode } from '@memory-mcp/common';
import type { MarkdownNote } from '@memory-mcp/common';
import { FtsSearchEngine } from './fts-index';
import { LinkGraphManager } from './link-graph';
import { DatabaseManager, createDefaultConfig } from './database';
import {
  SearchOptions,
  ConnectedNotesOptions,
  BacklinkOptions,
  IndexConfig,
  SearchError,
  EnhancedSearchResult,
  BatchIndexResult,
  SearchMetrics
} from './types';

/**
 * 하이브리드 검색 엔진 클래스
 */
export class SearchEngine {
  private dbManager: DatabaseManager;
  private ftsEngine: FtsSearchEngine;
  private linkGraph: LinkGraphManager;
  private isInitialized: boolean = false;

  constructor(config: IndexConfig) {
    try {
      logger.debug('검색 엔진 초기화 시작', { dbPath: config.dbPath });

      this.dbManager = new DatabaseManager(config);
      const database = this.dbManager.getDatabase();

      this.ftsEngine = new FtsSearchEngine(database);
      this.linkGraph = new LinkGraphManager(database);

      this.isInitialized = true;
      logger.info('검색 엔진 초기화 완료');

    } catch (error) {
      throw new SearchError('검색 엔진 초기화 실패', error);
    }
  }

  /**
   * 하이브리드 검색 (FTS + 링크 그래프)
   */
  public async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    const startTime = Date.now();

    try {
      logger.debug('하이브리드 검색 시작', { query, options });

      // FTS 검색 실행
      const ftsResult = await this.ftsEngine.searchNotes(query, options);

      // 링크 기반 검색 결과 보강
      const enhancedResults = await this.enhanceWithLinkData(
        ftsResult.results,
        options
      );

      // 결과 재정렬 (FTS 점수 + 링크 점수)
      const rerankedResults = this.rerankResults(enhancedResults);

      const totalTime = Date.now() - startTime;

      const enhancedMetrics: SearchMetrics = {
        ...ftsResult.metrics,
        totalTimeMs: totalTime
      };

      logger.debug('하이브리드 검색 완료', {
        query,
        totalResults: ftsResult.totalCount,
        enhancedResults: rerankedResults.length,
        timeMs: totalTime
      });

      return {
        results: rerankedResults,
        metrics: enhancedMetrics,
        totalCount: ftsResult.totalCount
      };

    } catch (error) {
      const errorTime = Date.now() - startTime;
      logger.error('하이브리드 검색 실패', { query, options, timeMs: errorTime, error });
      throw new SearchError(`하이브리드 검색 실패: ${query}`, error);
    }
  }

  /**
   * 링크 데이터로 검색 결과 보강
   */
  private async enhanceWithLinkData(
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const enhancedResults: SearchResult[] = [];

    for (const result of results) {
      try {
        // 백링크 정보 추가
        const backlinks = await this.linkGraph.findBacklinks(result.id, {
          limit: 10
        });

        // 아웃바운드 링크 정보 추가
        const outboundLinks = await this.linkGraph.findOutboundLinks(result.id, 10);

        // 링크 점수 계산 (백링크 수와 강도 기반)
        const linkScore = this.calculateLinkScore(backlinks, outboundLinks);

        enhancedResults.push({
          ...result,
          links: outboundLinks.map(link => link.targetUid),
          score: this.combineScores(result.score, linkScore)
        });

      } catch (error) {
        logger.warn('링크 데이터 보강 실패, 원본 결과 사용', {
          resultId: result.id,
          error
        });
        enhancedResults.push(result);
      }
    }

    return enhancedResults;
  }

  /**
   * 링크 점수 계산
   */
  private calculateLinkScore(
    backlinks: any[],
    outboundLinks: any[]
  ): number {
    // 백링크 점수 (더 중요하게 가중)
    const backlinkScore = backlinks.reduce((sum, link) => sum + link.strength, 0) * 2;

    // 아웃바운드 링크 점수
    const outboundScore = outboundLinks.reduce((sum, link) => sum + link.strength, 0);

    // 정규화된 링크 점수 (0-1 범위)
    const totalScore = backlinkScore + outboundScore;
    return Math.min(totalScore / 20, 1.0); // 최대 20으로 정규화
  }

  /**
   * FTS 점수와 링크 점수 결합
   */
  private combineScores(ftsScore: number, linkScore: number): number {
    // 가중 평균: FTS 70%, 링크 30%
    return (ftsScore * 0.7) + (linkScore * 0.3);
  }

  /**
   * 결과 재정렬
   */
  private rerankResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // 결합된 점수로 정렬
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // 점수가 같으면 링크 수로 정렬
      const aLinkCount = a.links?.length || 0;
      const bLinkCount = b.links?.length || 0;
      return bLinkCount - aLinkCount;
    });
  }

  /**
   * 연결된 노트 검색
   */
  public async findConnectedNotes(
    noteId: string,
    options: ConnectedNotesOptions = {}
  ): Promise<LinkGraphNode[]> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      return await this.linkGraph.findConnectedNotes(noteId, options);
    } catch (error) {
      throw new SearchError(`연결된 노트 검색 실패: ${noteId}`, error);
    }
  }

  /**
   * 백링크 검색
   */
  public async findBacklinks(
    noteId: string,
    options: BacklinkOptions = {}
  ): Promise<any[]> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      return await this.linkGraph.findBacklinks(noteId, options);
    } catch (error) {
      throw new SearchError(`백링크 검색 실패: ${noteId}`, error);
    }
  }

  /**
   * 고아 노트 검색
   */
  public async findOrphanNotes(limit: number = 50): Promise<any[]> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      return await this.linkGraph.findOrphanNotes(limit);
    } catch (error) {
      throw new SearchError('고아 노트 검색 실패', error);
    }
  }

  /**
   * 노트 인덱싱
   */
  public async indexNote(note: MarkdownNote): Promise<void> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      logger.debug('노트 인덱싱 시작', { uid: note.frontMatter.id });

      const transaction = this.dbManager.transaction(() => {
        // 노트 메타데이터 저장/업데이트
        this.upsertNoteMetadata(note);

        // FTS 인덱스 업데이트
        this.ftsEngine.updateNote(note);

        // 링크 관계 업데이트
        const outboundLinks = note.frontMatter.links || [];
        this.linkGraph.updateNoteLinks(note, outboundLinks);
      });

      transaction();

      logger.debug('노트 인덱싱 완료', { uid: note.frontMatter.id });

    } catch (error) {
      logger.error('노트 인덱싱 실패', { uid: note.frontMatter.id, error });
      throw new SearchError(`노트 인덱싱 실패: ${note.frontMatter.id}`, error);
    }
  }

  /**
   * 노트 메타데이터 저장/업데이트
   */
  private upsertNoteMetadata(note: MarkdownNote): void {
    const stmt = this.dbManager.getDatabase().prepare(`
      INSERT OR REPLACE INTO notes (
        uid, title, category, file_path, project, tags,
        content_hash, created_at, updated_at, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    // 콘텐츠 해시 계산
    const crypto = require('crypto');
    const contentHash = crypto
      .createHash('sha256')
      .update(note.content)
      .digest('hex');

    stmt.run([
      note.frontMatter.id,
      note.frontMatter.title,
      note.frontMatter.category,
      note.filePath,
      note.frontMatter.project || null,
      JSON.stringify(note.frontMatter.tags),
      contentHash,
      note.frontMatter.created,
      note.frontMatter.updated
    ]);
  }

  /**
   * 노트 삭제
   */
  public async removeNote(noteUid: string): Promise<void> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      logger.debug('노트 삭제 시작', { uid: noteUid });

      const transaction = this.dbManager.transaction(() => {
        // 노트 메타데이터 삭제
        const deleteNoteStmt = this.dbManager.getDatabase().prepare(`
          DELETE FROM notes WHERE uid = ?
        `);
        deleteNoteStmt.run(noteUid);

        // FTS 인덱스에서 삭제
        this.ftsEngine.removeNote(noteUid);

        // 링크 관계 삭제
        this.linkGraph.removeNoteLinks(noteUid);
      });

      transaction();

      logger.debug('노트 삭제 완료', { uid: noteUid });

    } catch (error) {
      logger.error('노트 삭제 실패', { uid: noteUid, error });
      throw new SearchError(`노트 삭제 실패: ${noteUid}`, error);
    }
  }

  /**
   * 배치 인덱싱
   */
  public async indexNotes(notes: MarkdownNote[]): Promise<BatchIndexResult> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const failures: Array<{ noteUid: string; error: string }> = [];

    try {
      logger.info('배치 인덱싱 시작', { noteCount: notes.length });

      // 배치 크기로 나누어 처리
      const batchSize = 100;

      for (let i = 0; i < notes.length; i += batchSize) {
        const batch = notes.slice(i, i + batchSize);

        const transaction = this.dbManager.transaction(() => {
          for (const note of batch) {
            try {
              // 노트 메타데이터 저장/업데이트
              this.upsertNoteMetadata(note);

              // FTS 인덱스 업데이트
              this.ftsEngine.updateNote(note);

              // 링크 관계 업데이트
              const outboundLinks = note.frontMatter.links || [];
              this.linkGraph.updateNoteLinks(note, outboundLinks);

              successful++;

            } catch (error) {
              failed++;
              failures.push({
                noteUid: note.frontMatter.id,
                error: error instanceof Error ? error.message : String(error)
              });
              logger.warn('배치 인덱싱 중 노트 처리 실패', {
                uid: note.frontMatter.id,
                error
              });
            }
          }
        });

        transaction();

        // 진행 상황 로깅
        const progress = Math.min(i + batchSize, notes.length);
        logger.debug(`배치 인덱싱 진행: ${progress}/${notes.length}`);
      }

      const totalTimeMs = Date.now() - startTime;

      logger.info('배치 인덱싱 완료', {
        total: notes.length,
        successful,
        failed,
        timeMs: totalTimeMs
      });

      return {
        successful,
        failed,
        totalTimeMs,
        failures
      };

    } catch (error) {
      const totalTimeMs = Date.now() - startTime;
      logger.error('배치 인덱싱 실패', { error, timeMs: totalTimeMs });
      throw new SearchError('배치 인덱싱 실패', error);
    }
  }

  /**
   * 검색 엔진 통계
   */
  public getStats(): {
    database: any;
    links: any;
    indexSize: number;
  } {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      const dbStats = this.dbManager.getStats();
      const linkStats = this.linkGraph.getLinkStats();

      return {
        database: dbStats,
        links: linkStats,
        indexSize: dbStats.dbSizeBytes
      };

    } catch (error) {
      throw new SearchError('통계 조회 실패', error);
    }
  }

  /**
   * 인덱스 최적화
   */
  public async optimize(): Promise<void> {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    try {
      logger.info('검색 엔진 최적화 시작');

      // FTS 인덱스 최적화
      this.ftsEngine.optimize();

      // 데이터베이스 최적화
      this.dbManager.optimize();

      logger.info('검색 엔진 최적화 완료');

    } catch (error) {
      throw new SearchError('검색 엔진 최적화 실패', error);
    }
  }

  /**
   * 무결성 검사
   */
  public checkIntegrity(): boolean {
    if (!this.isInitialized) {
      throw new SearchError('검색 엔진이 초기화되지 않았습니다');
    }

    return this.dbManager.checkIntegrity();
  }

  /**
   * 정리 작업
   */
  public cleanup(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      logger.debug('검색 엔진 정리 시작');

      this.ftsEngine.cleanup();
      this.linkGraph.cleanup();
      this.dbManager.close();

      this.isInitialized = false;
      logger.info('검색 엔진 정리 완료');

    } catch (error) {
      logger.error('검색 엔진 정리 실패', error);
    }
  }
}

/**
 * 검색 엔진 팩토리 함수
 */
export function createSearchEngine(config: IndexConfig): SearchEngine {
  return new SearchEngine(config);
}

/**
 * 기본 설정으로 검색 엔진 생성
 */
export function createDefaultSearchEngine(dbPath: string): SearchEngine {
  const config = createDefaultConfig(dbPath);
  return new SearchEngine(config);
}