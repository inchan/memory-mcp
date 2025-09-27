/**
 * SQLite FTS5 기반 전문 검색 엔진
 */

import Database from 'better-sqlite3';
import { logger, SearchResult } from '@memory-mcp/common';
import { MarkdownNote } from '@memory-mcp/common';
import {
  SearchOptions,
  SearchError,
  SearchMetrics,
  EnhancedSearchResult
} from './types';

/**
 * FTS5 검색 엔진 클래스
 */
export class FtsSearchEngine {
  private db: Database;

  // 준비된 쿼리문들 (성능 최적화)
  private readonly searchStmt: Database.Statement;
  private readonly insertStmt: Database.Statement;
  private readonly updateStmt: Database.Statement;
  private readonly deleteStmt: Database.Statement;
  private readonly countStmt: Database.Statement;

  constructor(database: Database) {
    this.db = database;

    // 준비된 쿼리문 초기화
    this.searchStmt = this.prepareSearchQuery();
    this.insertStmt = this.prepareInsertQuery();
    this.updateStmt = this.prepareUpdateQuery();
    this.deleteStmt = this.prepareDeleteQuery();
    this.countStmt = this.prepareCountQuery();
  }

  /**
   * 전문 검색 실행
   */
  public async searchNotes(
    query: string,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult> {
    const startTime = Date.now();

    try {
      logger.debug('FTS 검색 시작', { query, options });

      const {
        limit = 50,
        offset = 0,
        category,
        tags,
        project,
        snippetLength = 150,
        highlightTag = 'mark'
      } = options;

      // 검색 쿼리 구성
      const { ftsQuery, params } = this.buildSearchQuery(query, options);

      // 총 결과 수 조회 (페이징용)
      const totalCount = this.getTotalCount(ftsQuery, params);

      // 검색 실행
      const queryStartTime = Date.now();
      const rawResults = this.executeSearch(ftsQuery, params, limit, offset);
      const queryTime = Date.now() - queryStartTime;

      // 결과 처리 및 강화
      const processingStartTime = Date.now();
      const enhancedResults = await this.enhanceResults(
        rawResults,
        snippetLength,
        highlightTag
      );
      const processingTime = Date.now() - processingStartTime;

      const totalTime = Date.now() - startTime;

      const metrics: SearchMetrics = {
        queryTimeMs: queryTime,
        processingTimeMs: processingTime,
        totalTimeMs: totalTime,
        totalResults: totalCount,
        returnedResults: enhancedResults.length,
        cacheHit: false // TODO: 캐시 구현 시 업데이트
      };

      logger.debug('FTS 검색 완료', {
        query,
        totalResults: totalCount,
        returnedResults: enhancedResults.length,
        timeMs: totalTime
      });

      return {
        results: enhancedResults,
        metrics,
        totalCount
      };

    } catch (error) {
      const errorTime = Date.now() - startTime;
      logger.error('FTS 검색 실패', { query, options, timeMs: errorTime, error });
      throw new SearchError(`전문 검색 실패: ${query}`, error);
    }
  }

  /**
   * 노트를 FTS 인덱스에 추가
   */
  public async indexNote(note: MarkdownNote): Promise<void> {
    try {
      logger.debug('노트 인덱싱 시작', { uid: note.frontMatter.id });

      const params = {
        uid: note.frontMatter.id,
        title: note.frontMatter.title,
        content: this.cleanContent(note.content),
        tags: note.frontMatter.tags.join(' '),
        category: note.frontMatter.category,
        project: note.frontMatter.project || ''
      };

      this.insertStmt.run(params);

      logger.debug('노트 인덱싱 완료', { uid: note.frontMatter.id });

    } catch (error) {
      logger.error('노트 인덱싱 실패', { uid: note.frontMatter.id, error });
      throw new SearchError(`노트 인덱싱 실패: ${note.frontMatter.id}`, error);
    }
  }

  /**
   * FTS 인덱스에서 노트 업데이트
   */
  public async updateNote(note: MarkdownNote): Promise<void> {
    try {
      logger.debug('노트 인덱스 업데이트 시작', { uid: note.frontMatter.id });

      const params = {
        uid: note.frontMatter.id,
        title: note.frontMatter.title,
        content: this.cleanContent(note.content),
        tags: note.frontMatter.tags.join(' '),
        category: note.frontMatter.category,
        project: note.frontMatter.project || ''
      };

      const changes = this.updateStmt.run(params);

      if (changes.changes === 0) {
        // 노트가 없으면 새로 추가
        await this.indexNote(note);
      }

      logger.debug('노트 인덱스 업데이트 완료', { uid: note.frontMatter.id });

    } catch (error) {
      logger.error('노트 인덱스 업데이트 실패', { uid: note.frontMatter.id, error });
      throw new SearchError(`노트 인덱스 업데이트 실패: ${note.frontMatter.id}`, error);
    }
  }

  /**
   * FTS 인덱스에서 노트 삭제
   */
  public async removeNote(noteUid: string): Promise<void> {
    try {
      logger.debug('노트 인덱스 삭제 시작', { uid: noteUid });

      const changes = this.deleteStmt.run({ uid: noteUid });

      logger.debug('노트 인덱스 삭제 완료', {
        uid: noteUid,
        deleted: changes.changes > 0
      });

    } catch (error) {
      logger.error('노트 인덱스 삭제 실패', { uid: noteUid, error });
      throw new SearchError(`노트 인덱스 삭제 실패: ${noteUid}`, error);
    }
  }

  /**
   * 검색 쿼리 준비
   */
  private prepareSearchQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT
        nf.uid,
        nf.title,
        nf.category,
        nf.project,
        nf.tags,
        n.file_path,
        bm25(notes_fts) as score,
        highlight(notes_fts, 1, '<HIGHLIGHT>', '</HIGHLIGHT>') as title_highlight,
        snippet(notes_fts, 2, '<HIGHLIGHT>', '</HIGHLIGHT>', '...', ?) as content_snippet
      FROM notes_fts nf
      JOIN notes n ON nf.uid = n.uid
      WHERE notes_fts MATCH ?
        AND (? IS NULL OR nf.category = ?)
        AND (? IS NULL OR nf.project = ?)
        AND (? = 0 OR EXISTS (
          SELECT 1 FROM (
            SELECT value FROM json_each('[' || ? || ']')
          ) tags WHERE nf.tags LIKE '%' || tags.value || '%'
        ))
      ORDER BY bm25(notes_fts)
      LIMIT ? OFFSET ?
    `);
  }

  /**
   * 삽입 쿼리 준비
   */
  private prepareInsertQuery(): Database.Statement {
    return this.db.prepare(`
      INSERT INTO notes_fts (uid, title, content, tags, category, project)
      VALUES (@uid, @title, @content, @tags, @category, @project)
    `);
  }

  /**
   * 업데이트 쿼리 준비
   */
  private prepareUpdateQuery(): Database.Statement {
    return this.db.prepare(`
      UPDATE notes_fts
      SET title = @title,
          content = @content,
          tags = @tags,
          category = @category,
          project = @project
      WHERE uid = @uid
    `);
  }

  /**
   * 삭제 쿼리 준비
   */
  private prepareDeleteQuery(): Database.Statement {
    return this.db.prepare(`
      DELETE FROM notes_fts WHERE uid = @uid
    `);
  }

  /**
   * 개수 쿼리 준비
   */
  private prepareCountQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT COUNT(*) as count
      FROM notes_fts nf
      WHERE notes_fts MATCH ?
        AND (? IS NULL OR nf.category = ?)
        AND (? IS NULL OR nf.project = ?)
        AND (? = 0 OR EXISTS (
          SELECT 1 FROM (
            SELECT value FROM json_each('[' || ? || ']')
          ) tags WHERE nf.tags LIKE '%' || tags.value || '%'
        ))
    `);
  }

  /**
   * 검색 쿼리 구성
   */
  private buildSearchQuery(
    query: string,
    options: SearchOptions
  ): { ftsQuery: string; params: any[] } {
    // FTS5 쿼리 문법으로 변환
    const ftsQuery = this.transformToFtsQuery(query);

    // 태그 필터 처리
    const tagsArray = options.tags || [];
    const tagsJson = tagsArray.length > 0 ?
      '"' + tagsArray.join('","') + '"' : '';

    const params = [
      20, // snippet length (lines)
      ftsQuery,
      options.category || null,
      options.category || null,
      options.project || null,
      options.project || null,
      tagsArray.length,
      tagsJson,
      options.limit || 50,
      options.offset || 0
    ];

    return { ftsQuery, params };
  }

  /**
   * 검색 쿼리를 FTS5 문법으로 변환
   */
  private transformToFtsQuery(query: string): string {
    // 기본적인 쿼리 정리
    let ftsQuery = query
      .trim()
      .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ-]/g, ' ') // 특수문자 제거
      .replace(/\s+/g, ' ')                      // 연속 공백 정리
      .trim();

    // 빈 쿼리 처리
    if (!ftsQuery) {
      return '*';
    }

    // 한글과 영문 혼재 처리
    const words = ftsQuery.split(' ').filter(word => word.length > 0);

    if (words.length === 1) {
      // 단일 단어 - 부분 일치 지원
      return `"${words[0]}"*`;
    } else {
      // 여러 단어 - AND 연산으로 모든 단어 포함
      return words.map(word => `"${word}"`).join(' AND ');
    }
  }

  /**
   * 총 결과 수 조회
   */
  private getTotalCount(ftsQuery: string, params: any[]): number {
    try {
      // count 쿼리용 파라미터 (snippet length 제외)
      const countParams = params.slice(1, -2); // limit, offset 제외

      const result = this.countStmt.get(...countParams) as { count: number };
      return result.count;

    } catch (error) {
      logger.warn('총 결과 수 조회 실패', { ftsQuery, error });
      return 0;
    }
  }

  /**
   * 검색 실행
   */
  private executeSearch(
    ftsQuery: string,
    params: any[],
    limit: number,
    offset: number
  ): any[] {
    try {
      return this.searchStmt.all(...params);
    } catch (error) {
      logger.error('FTS 쿼리 실행 실패', { ftsQuery, params, error });
      throw error;
    }
  }

  /**
   * 검색 결과 강화 (스니펫, 하이라이팅 등)
   */
  private async enhanceResults(
    rawResults: any[],
    snippetLength: number,
    highlightTag: string
  ): Promise<SearchResult[]> {
    return rawResults.map((row): SearchResult => {
      // 태그 문자열을 배열로 변환
      const tags = row.tags ? row.tags.split(' ').filter((t: string) => t.length > 0) : [];

      // 하이라이트 태그 변환
      const snippet = row.content_snippet
        ?.replace(/<HIGHLIGHT>/g, `<${highlightTag}>`)
        ?.replace(/<\/HIGHLIGHT>/g, `</${highlightTag}>`) || '';

      const title = row.title_highlight
        ?.replace(/<HIGHLIGHT>/g, `<${highlightTag}>`)
        ?.replace(/<\/HIGHLIGHT>/g, `</${highlightTag}>`) || row.title;

      return {
        id: row.uid,
        title,
        category: row.category,
        snippet: this.truncateSnippet(snippet, snippetLength),
        score: Math.max(0, -row.score), // BM25 점수는 음수이므로 변환
        filePath: row.file_path,
        tags,
        links: [] // 링크는 별도 쿼리에서 조회
      };
    });
  }

  /**
   * 스니펫 길이 조정
   */
  private truncateSnippet(snippet: string, maxLength: number): string {
    if (snippet.length <= maxLength) {
      return snippet;
    }

    // 하이라이트 태그를 고려하여 자르기
    let truncated = snippet.substring(0, maxLength);

    // 마지막 완전한 단어까지만 포함
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated + '...';
  }

  /**
   * 콘텐츠 정리 (인덱싱용)
   */
  private cleanContent(content: string): string {
    return content
      // 마크다운 문법 제거
      .replace(/#{1,6}\s/g, '')           // 헤딩
      .replace(/\*\*(.*?)\*\*/g, '$1')    // 볼드
      .replace(/\*(.*?)\*/g, '$1')        // 이탤릭
      .replace(/`([^`]+)`/g, '$1')        // 인라인 코드
      .replace(/```[\s\S]*?```/g, '')     // 코드 블록
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 링크
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1') // 이미지
      // 여분의 공백 정리
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * FTS 인덱스 최적화
   */
  public optimize(): void {
    try {
      logger.info('FTS 인덱스 최적화 시작');

      const startTime = Date.now();
      this.db.exec("INSERT INTO notes_fts(notes_fts) VALUES('optimize')");
      const duration = Date.now() - startTime;

      logger.info(`FTS 인덱스 최적화 완료 (${duration}ms)`);

    } catch (error) {
      logger.error('FTS 인덱스 최적화 실패', error);
      throw new SearchError('FTS 인덱스 최적화 실패', error);
    }
  }

  /**
   * FTS 인덱스 재구축
   */
  public rebuild(): void {
    try {
      logger.info('FTS 인덱스 재구축 시작');

      const startTime = Date.now();
      this.db.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
      const duration = Date.now() - startTime;

      logger.info(`FTS 인덱스 재구축 완료 (${duration}ms)`);

    } catch (error) {
      logger.error('FTS 인덱스 재구축 실패', error);
      throw new SearchError('FTS 인덱스 재구축 실패', error);
    }
  }

  /**
   * 정리 작업
   */
  public cleanup(): void {
    // 준비된 쿼리문들 정리 (better-sqlite3에서는 자동으로 정리됨)
    logger.debug('FTS 검색 엔진 정리 완료');
  }
}