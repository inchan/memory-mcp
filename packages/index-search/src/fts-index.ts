/**
 * SQLite FTS5 기반 전문 검색 엔진
 */

import { logger, SearchResult } from '@memory-mcp/common';
import { MarkdownNote } from '@memory-mcp/common';
import {
  SearchOptions,
  SearchError,
  SearchMetrics,
  EnhancedSearchResult
} from './types';
import type { SqliteDatabase } from './database';

type Statement = ReturnType<SqliteDatabase['prepare']>;

/**
 * FTS5 검색 엔진 클래스
 */
export class FtsSearchEngine {
  private db: SqliteDatabase;

  // 준비된 쿼리문들 (성능 최적화)
  private readonly searchStmt: Statement;
  private readonly insertStmt: Statement;
  private readonly updateStmt: Statement;
  private readonly deleteStmt: Statement;
  private readonly countStmt: Statement;

  constructor(database: SqliteDatabase) {
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
        snippetLength = 150,
        highlightTag = 'mark'
      } = options;

      // 검색 쿼리 구성
      const { ftsQuery, params } = this.buildSearchQuery(query, options);

      // 총 결과 수 조회 (페이징용)
      const totalCount = this.getTotalCount(ftsQuery, params);

      // 검색 실행
      const queryStartTime = Date.now();
      const rawResults = this.executeSearch(ftsQuery, params);
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
  public indexNote(note: MarkdownNote): void {
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
  public updateNote(note: MarkdownNote): void {
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
        this.indexNote(note);
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
  public removeNote(noteUid: string): void {
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
  private prepareSearchQuery(): Statement {
    return this.db.prepare(`
      SELECT
        nf.uid,
        nf.title,
        nf.category,
        nf.project,
        nf.tags,
        n.file_path,
        bm25(nf) as score,
        highlight(nf, 1, '<HIGHLIGHT>', '</HIGHLIGHT>') as title_highlight,
        snippet(nf, 2, '<HIGHLIGHT>', '</HIGHLIGHT>', '...', ?) as content_snippet,
        COALESCE(GROUP_CONCAT(DISTINCT l.target_uid), '') as outgoing_links
      FROM notes_fts nf
      JOIN notes n ON nf.uid = n.uid
      LEFT JOIN links l ON l.source_uid = nf.uid AND l.link_type = 'internal'
      WHERE nf MATCH ?
        AND (? IS NULL OR nf.category = ?)
        AND (? IS NULL OR nf.project = ?)
        AND (? = 0 OR EXISTS (
          SELECT 1 FROM (
            SELECT value FROM json_each('[' || ? || ']')
          ) tags WHERE nf.tags LIKE '%' || tags.value || '%'
        ))
      GROUP BY nf.uid
      ORDER BY bm25(nf)
      LIMIT ? OFFSET ?
    `);
  }

  /**
   * 삽입 쿼리 준비
   */
  private prepareInsertQuery(): Statement {
    return this.db.prepare(`
      INSERT INTO notes_fts (uid, title, content, tags, category, project)
      VALUES (@uid, @title, @content, @tags, @category, @project)
    `);
  }

  /**
   * 업데이트 쿼리 준비
   */
  private prepareUpdateQuery(): Statement {
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
  private prepareDeleteQuery(): Statement {
    return this.db.prepare(`
      DELETE FROM notes_fts WHERE uid = @uid
    `);
  }

  /**
   * 개수 쿼리 준비
   */
  private prepareCountQuery(): Statement {
    return this.db.prepare(`
      SELECT COUNT(DISTINCT nf.uid) as count
      FROM notes_fts nf
      WHERE nf MATCH ?
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
  ): { ftsQuery: string; params: unknown[] } {
    // FTS5 쿼리 문법으로 변환
    const ftsQuery = this.transformToFtsQuery(query);

    // 태그 필터 처리
    const tagsArray = options.tags || [];
    const tagsJson = tagsArray.length > 0 ?
      '"' + tagsArray.join('","') + '"' : '';

    const params = [
      this.estimateSnippetTokens(options.snippetLength ?? 150),
      ftsQuery,
      options.category || null,
      options.category || null,
      options.project || null,
      options.project || null,
      tagsArray.length,
      tagsJson,
      options.limit ?? 50,
      options.offset ?? 0
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
   * 스니펫 길이에 맞춰 토큰 수를 추정
   */
  private estimateSnippetTokens(snippetLength: number): number {
    const normalized = Math.max(40, Math.min(400, snippetLength));
    return Math.max(20, Math.floor(normalized / 4));
  }

  /**
   * 총 결과 수 조회
   */
  private getTotalCount(ftsQuery: string, params: unknown[]): number {
    try {
      // count 쿼리용 파라미터 (snippet length 제외)
      const countParams = params.slice(1, -2); // limit, offset 제외

      const result = (this.countStmt as any).get(...countParams) as { count: number };
      return result.count;

    } catch (error) {
      logger.warn('총 결과 수 조회 실패', { ftsQuery, error });
      return 0;
    }
  }

  /**
   * 검색 실행
   */
  private executeSearch(ftsQuery: string, params: unknown[]): any[] {
    try {
      return (this.searchStmt as any).all(...params);
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

      const links = row.outgoing_links
        ? String(row.outgoing_links)
            .split(',')
            .map((value: string) => value.trim())
            .filter((value: string) => value.length > 0)
        : [];

      const rawScore = typeof row.score === 'number' ? row.score : Number(row.score ?? 0);
      const score = Number.isFinite(rawScore) && rawScore >= 0 ? 1 / (1 + rawScore) : 0;

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
        score,
        filePath: row.file_path,
        tags,
        links
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