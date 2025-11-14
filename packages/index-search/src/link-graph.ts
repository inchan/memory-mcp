/**
 * 링크 그래프 관리 및 탐색 유틸리티
 */

import { logger, MarkdownNote, normalizePath, parseAllLinks, LinkGraphNode } from '@memory-mcp/common';
import type { SqliteDatabase } from './database';
import type {
  BacklinkOptions,
  ConnectedNotesOptions,
  LinkRelation,
  OrphanNote,
} from './types';

const UID_PATTERN = /^\d{8}T\d{12}Z$/;
const EXTERNAL_PATTERN = /^https?:\/\//i;

type LinkAccumulator = {
  targetUid: string;
  linkType: LinkRelation['linkType'];
  strength: number;
};

interface LinkRow {
  source_uid: string;
  target_uid: string;
  link_type: string;
  strength: number;
  created_at: string;
  last_seen_at: string;
}

interface NoteRow {
  uid: string;
  title: string;
  category: string;
  tags: string | null;
}

/**
 * 노트 간 링크 그래프 엔진
 */
export class LinkGraphEngine {
  private readonly db: SqliteDatabase;

  private readonly resolveByUidOrTitleStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly resolveByFileNameStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly listLinksBySourceStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly deleteLinkStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly upsertLinkStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly outgoingLinksStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly incomingLinksStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly orphanNotesStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly noteMetadataStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly removeSourceLinksStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly removeTargetLinksStmt: ReturnType<SqliteDatabase['prepare']>;

  constructor(database: SqliteDatabase) {
    this.db = database;

    this.resolveByUidOrTitleStmt = this.db.prepare(`
      SELECT uid
      FROM notes
      WHERE uid = ?
         OR LOWER(title) = LOWER(?)
      LIMIT 1
    `);

    this.resolveByFileNameStmt = this.db.prepare(`
      SELECT uid
      FROM notes
      WHERE LOWER(file_path) = LOWER(@candidate)
         OR LOWER(file_path) = LOWER(@candidateWithExt)
         OR LOWER(file_path) LIKE LOWER(@pattern)
      ORDER BY LENGTH(file_path) ASC
      LIMIT 1
    `);

    this.listLinksBySourceStmt = this.db.prepare(`
      SELECT target_uid, link_type
      FROM links
      WHERE source_uid = ?
    `);

    this.deleteLinkStmt = this.db.prepare(`
      DELETE FROM links
      WHERE source_uid = @sourceUid
        AND target_uid = @targetUid
        AND link_type = @linkType
    `);

    this.upsertLinkStmt = this.db.prepare(`
      INSERT INTO links (
        source_uid,
        target_uid,
        link_type,
        strength,
        created_at,
        last_seen_at
      ) VALUES (@sourceUid, @targetUid, @linkType, @strength, @timestamp, @timestamp)
      ON CONFLICT(source_uid, target_uid, link_type)
      DO UPDATE SET
        strength = excluded.strength,
        last_seen_at = excluded.last_seen_at
    `);

    this.outgoingLinksStmt = this.db.prepare(`
      SELECT source_uid, target_uid, link_type, strength, created_at, last_seen_at
      FROM links
      WHERE source_uid = ?
      ORDER BY strength DESC, last_seen_at DESC
    `);

    this.incomingLinksStmt = this.db.prepare(`
      SELECT source_uid, target_uid, link_type, strength, created_at, last_seen_at
      FROM links
      WHERE target_uid = ?
      ORDER BY strength DESC, last_seen_at DESC
    `);

    this.orphanNotesStmt = this.db.prepare(`
      SELECT
        n.uid,
        n.title,
        n.file_path,
        n.created_at,
        n.updated_at
      FROM notes n
      LEFT JOIN links lo ON lo.source_uid = n.uid AND lo.link_type = 'internal'
      LEFT JOIN links li ON li.target_uid = n.uid AND li.link_type = 'internal'
      WHERE lo.source_uid IS NULL AND li.target_uid IS NULL
      ORDER BY n.updated_at DESC
    `);

    this.noteMetadataStmt = this.db.prepare(`
      SELECT uid, title, category, tags
      FROM notes
      WHERE uid = ?
      LIMIT 1
    `);

    this.removeSourceLinksStmt = this.db.prepare(`
      DELETE FROM links WHERE source_uid = ?
    `);

    this.removeTargetLinksStmt = this.db.prepare(`
      DELETE FROM links WHERE target_uid = ?
    `);
  }

  /**
   * 노트의 링크 정보를 갱신합니다.
   */
  updateLinksForNote(note: MarkdownNote): void {
    const sourceUid = note.frontMatter.id;
    const timestamp = new Date().toISOString();

    const aggregated = new Map<string, LinkAccumulator>();

    const addLink = (raw: string | undefined | null) => {
      const value = raw?.trim();
      if (!value) {
        return;
      }

      const resolved = this.resolveLinkTarget(value);
      const key = this.makeLinkKey(resolved.targetUid, resolved.linkType);
      const current = aggregated.get(key);

      if (current) {
        current.strength += 1;
      } else {
        aggregated.set(key, {
          targetUid: resolved.targetUid,
          linkType: resolved.linkType,
          strength: 1,
        });
      }
    };

    for (const link of note.frontMatter.links ?? []) {
      addLink(link);
    }

    // Parse both Wiki links and Markdown links from content
    const parsedLinks = parseAllLinks(note.content);
    for (const link of parsedLinks.all) {
      addLink(link);
    }

    const existing = this.listLinksBySourceStmt.all(sourceUid) as Array<{ target_uid: string; link_type: string }>;
    const desiredKeys = new Set(aggregated.keys());

    for (const entry of aggregated.values()) {
      this.upsertLinkStmt.run({
        sourceUid,
        targetUid: entry.targetUid,
        linkType: entry.linkType,
        strength: entry.strength,
        timestamp,
      });
    }
    let removed = 0;
    for (const row of existing) {
      const key = this.makeLinkKey(row.target_uid, row.link_type);
      if (!desiredKeys.has(key)) {
        this.deleteLinkStmt.run({
          sourceUid,
          targetUid: row.target_uid,
          linkType: row.link_type,
        });
        removed += 1;
      }
    }

    logger.debug('링크 그래프 업데이트 완료', {
      uid: sourceUid,
      added: aggregated.size,
      removed,
    });
  }

  removeLinksForSource(sourceUid: string): void {
    this.removeSourceLinksStmt.run(sourceUid);
  }

  removeLinksToTarget(targetUid: string): void {
    this.removeTargetLinksStmt.run(targetUid);
  }

  getOutgoingLinks(sourceUid: string): LinkRelation[] {
    const rows = this.outgoingLinksStmt.all(sourceUid) as LinkRow[];
    return rows.map(row => this.mapLinkRow(row));
  }

  getBacklinks(targetUid: string, options: BacklinkOptions = {}): LinkRelation[] {
    const { limit = 50 } = options;
    const rows = this.incomingLinksStmt.all(targetUid) as LinkRow[];
    return rows.slice(0, limit).map(row => this.mapLinkRow(row));
  }

  getConnectedNodes(startUid: string, options: ConnectedNotesOptions = {}): LinkGraphNode[] {
    const { depth = 1, limit = 50, direction = 'both' } = options;

    const nodes = new Map<string, LinkGraphNode>();
    const collected = new Set<string>();
    const visited = new Set<string>([startUid]);
    const queue: Array<{ uid: string; depth: number }> = [{ uid: startUid, depth: 0 }];

    if (!this.ensureNode(startUid, nodes)) {
      return [];
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= depth) {
        continue;
      }

      if (direction === 'outgoing' || direction === 'both') {
        const sourceNode = this.ensureNode(current.uid, nodes);
        if (sourceNode) {
          const outgoing = this.outgoingLinksStmt.all(current.uid) as LinkRow[];
          for (const row of outgoing) {
            const targetNode = this.ensureNode(row.target_uid, nodes);
            if (!targetNode) {
              continue;
            }

            if (!sourceNode.outgoingLinks.includes(row.target_uid)) {
              sourceNode.outgoingLinks.push(row.target_uid);
            }

            if (!targetNode.incomingLinks.includes(row.source_uid)) {
              targetNode.incomingLinks.push(row.source_uid);
            }

            if (!visited.has(row.target_uid)) {
              visited.add(row.target_uid);
              queue.push({ uid: row.target_uid, depth: current.depth + 1 });
            }

            if (row.target_uid !== startUid) {
              collected.add(row.target_uid);
            }
          }
        }
      }

      if (direction === 'incoming' || direction === 'both') {
        const targetNode = this.ensureNode(current.uid, nodes);
        if (targetNode) {
          const incoming = this.incomingLinksStmt.all(current.uid) as LinkRow[];
          for (const row of incoming) {
            const sourceNode = this.ensureNode(row.source_uid, nodes);
            if (!sourceNode) {
              continue;
            }

            if (!sourceNode.outgoingLinks.includes(row.target_uid)) {
              sourceNode.outgoingLinks.push(row.target_uid);
            }

            if (!targetNode.incomingLinks.includes(row.source_uid)) {
              targetNode.incomingLinks.push(row.source_uid);
            }

            if (!visited.has(row.source_uid)) {
              visited.add(row.source_uid);
              queue.push({ uid: row.source_uid, depth: current.depth + 1 });
            }

            if (row.source_uid !== startUid) {
              collected.add(row.source_uid);
            }
          }
        }
      }

      if (limit > 0 && collected.size >= limit) {
        break;
      }
    }

    const result = Array.from(nodes.values()).filter(node => node.id !== startUid && collected.has(node.id));
    return limit > 0 ? result.slice(0, limit) : result;
  }

  getOrphanNotes(): OrphanNote[] {
    const rows = (this.orphanNotesStmt as any).all() as Array<{
      uid: string;
      title: string;
      file_path: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      uid: row.uid,
      title: row.title,
      filePath: row.file_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private mapLinkRow(row: LinkRow): LinkRelation {
    return {
      sourceUid: row.source_uid,
      targetUid: row.target_uid,
      linkType: row.link_type as LinkRelation['linkType'],
      strength: row.strength,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  private ensureNode(uid: string, nodes: Map<string, LinkGraphNode>): LinkGraphNode | null {
    let node = nodes.get(uid);
    if (node) {
      return node;
    }

    const row = this.noteMetadataStmt.get(uid) as NoteRow | undefined;
    if (!row) {
      return null;
    }

    node = {
      id: row.uid,
      title: row.title,
      category: row.category,
      tags: this.parseTags(row.tags),
      outgoingLinks: [],
      incomingLinks: [],
    };

    nodes.set(uid, node);
    return node;
  }

  private parseTags(raw: string | null): string[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private resolveLinkTarget(link: string): { targetUid: string; linkType: LinkRelation['linkType'] } {
    if (UID_PATTERN.test(link)) {
      return { targetUid: link, linkType: 'internal' };
    }

    if (EXTERNAL_PATTERN.test(link)) {
      return { targetUid: link, linkType: 'external' };
    }

    const directMatch = (this.resolveByUidOrTitleStmt as any).get(link, link) as { uid: string } | undefined;
    if (directMatch?.uid) {
      return { targetUid: directMatch.uid, linkType: 'internal' };
    }

    const normalized = normalizePath(link).toLowerCase();
    const candidateWithExt = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
    const baseName = candidateWithExt.replace(/\.md$/, '');
    const slug = baseName.replace(/\s+/g, '-');
    const slugWithExt = `${slug}.md`;

    const fileMatch = (this.resolveByFileNameStmt as any).get({
      candidate: normalized,
      candidateWithExt,
      pattern: `%${baseName}%`,
    }) as { uid: string } | undefined;

    if (fileMatch?.uid) {
      return { targetUid: fileMatch.uid, linkType: 'internal' };
    }

    const slugMatch = (this.resolveByFileNameStmt as any).get({
      candidate: slug,
      candidateWithExt: slugWithExt,
      pattern: `%${slug}%`,
    }) as { uid: string } | undefined;

    if (slugMatch?.uid) {
      return { targetUid: slugMatch.uid, linkType: 'internal' };
    }

    return { targetUid: link, linkType: 'tag' };
  }

  private makeLinkKey(targetUid: string, linkType: string): string {
    return `${linkType}::${targetUid}`;
  }
}
