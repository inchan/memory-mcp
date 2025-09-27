/**
 * 링크 그래프 관리 모듈
 * 노트 간의 링크 관계를 관리하고 그래프 기반 검색을 제공
 */

import Database from 'better-sqlite3';
import { logger, LinkGraphNode } from '@memory-mcp/common';
import type { MarkdownNote } from '@memory-mcp/common';
import {
  LinkRelation,
  OrphanNote,
  ConnectedNotesOptions,
  BacklinkOptions,
  DatabaseError,
  SearchError
} from './types';

/**
 * 링크 그래프 관리 클래스
 */
export class LinkGraphManager {
  private db: Database;

  // 준비된 쿼리문들
  private readonly insertLinkStmt: Database.Statement;
  private readonly updateLinkStmt: Database.Statement;
  private readonly deleteLinkStmt: Database.Statement;
  private readonly findBacklinksStmt: Database.Statement;
  private readonly findOutboundStmt: Database.Statement;
  private readonly findConnectedStmt: Database.Statement;
  private readonly findOrphansStmt: Database.Statement;

  constructor(database: Database) {
    this.db = database;

    // 준비된 쿼리문 초기화
    this.insertLinkStmt = this.prepareInsertLinkQuery();
    this.updateLinkStmt = this.prepareUpdateLinkQuery();
    this.deleteLinkStmt = this.prepareDeleteLinkQuery();
    this.findBacklinksStmt = this.prepareBacklinksQuery();
    this.findOutboundStmt = this.prepareOutboundQuery();
    this.findConnectedStmt = this.prepareConnectedQuery();
    this.findOrphansStmt = this.prepareOrphansQuery();
  }

  /**
   * 노트의 링크 관계 업데이트
   */
  public async updateNoteLinks(note: MarkdownNote, outboundLinks: string[]): Promise<void> {
    try {
      logger.debug('링크 관계 업데이트 시작', {
        uid: note.frontMatter.id,
        outboundCount: outboundLinks.length
      });

      const transaction = this.db.transaction(() => {
        // 기존 아웃바운드 링크 삭제
        this.deleteLinkStmt.run({ source_uid: note.frontMatter.id });

        // 새 링크 추가
        const currentTime = new Date().toISOString();

        for (const targetUid of outboundLinks) {
          // 자기 자신으로의 링크는 제외
          if (targetUid === note.frontMatter.id) {
            continue;
          }

          // 링크 강도 계산 (콘텐츠에서의 빈도)
          const strength = this.calculateLinkStrength(note.content, targetUid);

          this.insertLinkStmt.run({
            source_uid: note.frontMatter.id,
            target_uid: targetUid,
            link_type: 'internal',
            strength,
            created_at: currentTime,
            last_seen_at: currentTime
          });
        }
      });

      transaction();

      logger.debug('링크 관계 업데이트 완료', {
        uid: note.frontMatter.id,
        outboundCount: outboundLinks.length
      });

    } catch (error) {
      logger.error('링크 관계 업데이트 실패', { uid: note.frontMatter.id, error });
      throw new DatabaseError('링크 관계 업데이트 실패', error);
    }
  }

  /**
   * 특정 노트의 백링크 조회
   */
  public async findBacklinks(
    targetUid: string,
    options: BacklinkOptions = {}
  ): Promise<LinkRelation[]> {
    try {
      const { limit = 50, contextLines = 3 } = options;

      logger.debug('백링크 조회 시작', { targetUid, limit });

      const rawResults = this.findBacklinksStmt.all({
        target_uid: targetUid,
        limit
      });

      const backlinks: LinkRelation[] = rawResults.map((row: any): LinkRelation => ({
        sourceUid: row.source_uid,
        targetUid: row.target_uid,
        linkType: row.link_type as 'internal' | 'external' | 'tag',
        strength: row.strength,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at
      }));

      logger.debug('백링크 조회 완료', {
        targetUid,
        foundCount: backlinks.length
      });

      return backlinks;

    } catch (error) {
      logger.error('백링크 조회 실패', { targetUid, error });
      throw new SearchError('백링크 조회 실패', error);
    }
  }

  /**
   * 특정 노트의 아웃바운드 링크 조회
   */
  public async findOutboundLinks(
    sourceUid: string,
    limit: number = 50
  ): Promise<LinkRelation[]> {
    try {
      logger.debug('아웃바운드 링크 조회 시작', { sourceUid, limit });

      const rawResults = this.findOutboundStmt.all({
        source_uid: sourceUid,
        limit
      });

      const outboundLinks: LinkRelation[] = rawResults.map((row: any): LinkRelation => ({
        sourceUid: row.source_uid,
        targetUid: row.target_uid,
        linkType: row.link_type as 'internal' | 'external' | 'tag',
        strength: row.strength,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at
      }));

      logger.debug('아웃바운드 링크 조회 완료', {
        sourceUid,
        foundCount: outboundLinks.length
      });

      return outboundLinks;

    } catch (error) {
      logger.error('아웃바운드 링크 조회 실패', { sourceUid, error });
      throw new SearchError('아웃바운드 링크 조회 실패', error);
    }
  }

  /**
   * 연결된 노트들 조회 (그래프 탐색)
   */
  public async findConnectedNotes(
    startUid: string,
    options: ConnectedNotesOptions = {}
  ): Promise<LinkGraphNode[]> {
    try {
      const {
        depth = 2,
        limit = 100,
        direction = 'both'
      } = options;

      logger.debug('연결된 노트 탐색 시작', {
        startUid,
        depth,
        limit,
        direction
      });

      const visitedNodes = new Set<string>();
      const resultNodes = new Map<string, LinkGraphNode>();
      const queue: { uid: string; currentDepth: number; score: number }[] = [
        { uid: startUid, currentDepth: 0, score: 1.0 }
      ];

      visitedNodes.add(startUid);

      while (queue.length > 0 && resultNodes.size < limit) {
        const { uid, currentDepth, score } = queue.shift()!;

        if (currentDepth >= depth) {
          continue;
        }

        // 현재 노트와 연결된 노트들 조회
        const connectedUids = await this.getConnectedUids(uid, direction);

        for (const connectedUid of connectedUids) {
          if (visitedNodes.has(connectedUid)) {
            continue;
          }

          visitedNodes.add(connectedUid);

          // 노트 정보 조회
          const nodeInfo = await this.getNodeInfo(connectedUid);
          if (!nodeInfo) {
            continue;
          }

          // 점수 계산 (깊이에 따라 감소)
          const nodeScore = score * (0.7 ** currentDepth);

          resultNodes.set(connectedUid, {
            ...nodeInfo,
            score: nodeScore,
            depth: currentDepth + 1
          });

          // 다음 레벨 탐색을 위해 큐에 추가
          if (currentDepth + 1 < depth) {
            queue.push({
              uid: connectedUid,
              currentDepth: currentDepth + 1,
              score: nodeScore
            });
          }
        }
      }

      const result = Array.from(resultNodes.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);

      logger.debug('연결된 노트 탐색 완료', {
        startUid,
        foundCount: result.length,
        visitedCount: visitedNodes.size
      });

      return result;

    } catch (error) {
      logger.error('연결된 노트 탐색 실패', { startUid, error });
      throw new SearchError('연결된 노트 탐색 실패', error);
    }
  }

  /**
   * 고아 노트 (백링크가 없는 노트) 조회
   */
  public async findOrphanNotes(limit: number = 50): Promise<OrphanNote[]> {
    try {
      logger.debug('고아 노트 조회 시작', { limit });

      const rawResults = this.findOrphansStmt.all({ limit });

      const orphans: OrphanNote[] = rawResults.map((row: any): OrphanNote => ({
        uid: row.uid,
        title: row.title,
        filePath: row.file_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      logger.debug('고아 노트 조회 완료', { foundCount: orphans.length });

      return orphans;

    } catch (error) {
      logger.error('고아 노트 조회 실패', error);
      throw new SearchError('고아 노트 조회 실패', error);
    }
  }

  /**
   * 링크 강도 계산
   */
  private calculateLinkStrength(content: string, targetUid: string): number {
    // 콘텐츠에서 해당 UID가 언급된 횟수를 세어 강도 계산
    const regex = new RegExp(`\\b${targetUid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = content.match(regex);
    return matches ? Math.min(matches.length, 10) : 1; // 최대 10까지 제한
  }

  /**
   * 연결된 UID 목록 조회
   */
  private async getConnectedUids(
    uid: string,
    direction: 'outgoing' | 'incoming' | 'both'
  ): Promise<string[]> {
    const connectedUids: string[] = [];

    try {
      if (direction === 'outgoing' || direction === 'both') {
        const outbound = await this.findOutboundLinks(uid, 50);
        connectedUids.push(...outbound.map(link => link.targetUid));
      }

      if (direction === 'incoming' || direction === 'both') {
        const inbound = await this.findBacklinks(uid, { limit: 50 });
        connectedUids.push(...inbound.map(link => link.sourceUid));
      }

      // 중복 제거
      return Array.from(new Set(connectedUids));

    } catch (error) {
      logger.warn('연결된 UID 조회 중 오류', { uid, direction, error });
      return [];
    }
  }

  /**
   * 노트 정보 조회
   */
  private async getNodeInfo(uid: string): Promise<Omit<LinkGraphNode, 'score' | 'depth'> | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT uid, title, category, file_path, created_at, updated_at
        FROM notes
        WHERE uid = ?
      `);

      const result = stmt.get(uid) as any;

      if (!result) {
        return null;
      }

      return {
        id: result.uid,
        title: result.title,
        category: result.category,
        filePath: result.file_path,
        links: [] // 별도 쿼리에서 채움
      };

    } catch (error) {
      logger.warn('노트 정보 조회 실패', { uid, error });
      return null;
    }
  }

  /**
   * 노트 삭제 시 관련 링크 정리
   */
  public async removeNoteLinks(noteUid: string): Promise<void> {
    try {
      logger.debug('노트 링크 삭제 시작', { uid: noteUid });

      const transaction = this.db.transaction(() => {
        // 아웃바운드 링크 삭제
        this.deleteLinkStmt.run({ source_uid: noteUid });

        // 인바운드 링크 삭제
        const deleteInboundStmt = this.db.prepare(`
          DELETE FROM links WHERE target_uid = ?
        `);
        deleteInboundStmt.run(noteUid);
      });

      transaction();

      logger.debug('노트 링크 삭제 완료', { uid: noteUid });

    } catch (error) {
      logger.error('노트 링크 삭제 실패', { uid: noteUid, error });
      throw new DatabaseError('노트 링크 삭제 실패', error);
    }
  }

  /**
   * 링크 통계 조회
   */
  public getLinkStats(): {
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    averageLinksPerNote: number;
    mostLinkedNotes: Array<{ uid: string; linkCount: number }>;
  } {
    try {
      // 총 링크 수
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM links');
      const totalResult = totalStmt.get() as { count: number };

      // 링크 타입별 통계
      const typeStmt = this.db.prepare(`
        SELECT link_type, COUNT(*) as count
        FROM links
        GROUP BY link_type
      `);
      const typeResults = typeStmt.all() as Array<{ link_type: string; count: number }>;

      const internalLinks = typeResults.find(r => r.link_type === 'internal')?.count || 0;
      const externalLinks = typeResults.find(r => r.link_type === 'external')?.count || 0;

      // 노트 수
      const notesStmt = this.db.prepare('SELECT COUNT(*) as count FROM notes');
      const notesResult = notesStmt.get() as { count: number };

      // 평균 링크 수
      const averageLinksPerNote = notesResult.count > 0 ?
        totalResult.count / notesResult.count : 0;

      // 가장 많이 링크된 노트들
      const mostLinkedStmt = this.db.prepare(`
        SELECT target_uid as uid, COUNT(*) as linkCount
        FROM links
        GROUP BY target_uid
        ORDER BY linkCount DESC
        LIMIT 10
      `);
      const mostLinkedNotes = mostLinkedStmt.all() as Array<{ uid: string; linkCount: number }>;

      return {
        totalLinks: totalResult.count,
        internalLinks,
        externalLinks,
        averageLinksPerNote: Math.round(averageLinksPerNote * 100) / 100,
        mostLinkedNotes
      };

    } catch (error) {
      logger.error('링크 통계 조회 실패', error);
      throw new DatabaseError('링크 통계 조회 실패', error);
    }
  }

  /**
   * 준비된 쿼리문들
   */

  private prepareInsertLinkQuery(): Database.Statement {
    return this.db.prepare(`
      INSERT OR REPLACE INTO links (
        source_uid, target_uid, link_type, strength, created_at, last_seen_at
      ) VALUES (
        @source_uid, @target_uid, @link_type, @strength, @created_at, @last_seen_at
      )
    `);
  }

  private prepareUpdateLinkQuery(): Database.Statement {
    return this.db.prepare(`
      UPDATE links
      SET strength = @strength, last_seen_at = @last_seen_at
      WHERE source_uid = @source_uid AND target_uid = @target_uid
    `);
  }

  private prepareDeleteLinkQuery(): Database.Statement {
    return this.db.prepare(`
      DELETE FROM links WHERE source_uid = @source_uid
    `);
  }

  private prepareBacklinksQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT
        l.source_uid,
        l.target_uid,
        l.link_type,
        l.strength,
        l.created_at,
        l.last_seen_at
      FROM links l
      JOIN notes n ON l.source_uid = n.uid
      WHERE l.target_uid = @target_uid
      ORDER BY l.strength DESC, l.last_seen_at DESC
      LIMIT @limit
    `);
  }

  private prepareOutboundQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT
        l.source_uid,
        l.target_uid,
        l.link_type,
        l.strength,
        l.created_at,
        l.last_seen_at
      FROM links l
      JOIN notes n ON l.target_uid = n.uid
      WHERE l.source_uid = @source_uid
      ORDER BY l.strength DESC, l.last_seen_at DESC
      LIMIT @limit
    `);
  }

  private prepareConnectedQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT DISTINCT
        CASE
          WHEN l.source_uid = ? THEN l.target_uid
          ELSE l.source_uid
        END as connected_uid
      FROM links l
      WHERE l.source_uid = ? OR l.target_uid = ?
    `);
  }

  private prepareOrphansQuery(): Database.Statement {
    return this.db.prepare(`
      SELECT
        n.uid,
        n.title,
        n.file_path,
        n.created_at,
        n.updated_at
      FROM notes n
      LEFT JOIN links l ON n.uid = l.target_uid
      WHERE l.target_uid IS NULL
      ORDER BY n.updated_at DESC
      LIMIT @limit
    `);
  }

  /**
   * 정리 작업
   */
  public cleanup(): void {
    logger.debug('링크 그래프 매니저 정리 완료');
  }
}