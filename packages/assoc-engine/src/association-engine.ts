import { AssociationRequestSchema } from "./schemas.js";
import type {
  AssociationEngineConfig,
  AssociationRequest,
  AssociationResult,
  SearchEngineAdapter,
} from "./types.js";
import type { SearchResult } from "@memory-mcp/common";

const DEFAULT_CONFIG: Required<AssociationEngineConfig> = {
  defaultLimit: 5,
  maxCandidates: 25,
  timeoutMs: 250,
  scoring: {
    baseWeight: 0.55,
    linkWeight: 0.25,
    tagWeight: 0.15,
    contextWeight: 0.05,
  },
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]);
}

function normalizeScores(results: SearchResult[]): Map<string, number> {
  const maxScore = results.reduce((max, result) => Math.max(max, result.score), 0);
  const normalizationFactor = maxScore > 0 ? maxScore : 1;
  return new Map(
    results.map((result) => [result.id, clamp(result.score / normalizationFactor)])
  );
}

export class AssociationEngine {
  private readonly config: Required<AssociationEngineConfig>;

  constructor(
    private readonly searchEngine: SearchEngineAdapter,
    config: AssociationEngineConfig = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      scoring: { ...DEFAULT_CONFIG.scoring, ...(config.scoring ?? {}) },
    };
  }

  async generateRecommendations(request: AssociationRequest): Promise<AssociationResult> {
    let parsed: AssociationRequest;
    try {
      parsed = AssociationRequestSchema.parse(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Association request validation failed: ${message}`);
    }
    const start = Date.now();

    const limit = parsed.limit ?? this.config.defaultLimit;
    const candidateLimit = Math.max(limit * 3, this.config.maxCandidates);

    const result = await withTimeout(
      this.searchEngine.search(parsed.query, {
        limit: candidateLimit,
        tags: parsed.tags,
      }),
      this.config.timeoutMs,
      "AssociationEngine search timeout"
    );

    const normalizedScores = normalizeScores(result.results);
    const contextWeights = new Map(
      (parsed.contextNotes ?? []).map((note) => [note.id, note.weight ?? 1])
    );
    const contextTags = new Set(
      (parsed.contextNotes ?? []).flatMap((note) => note.tags ?? [])
    );
    for (const tag of parsed.tags ?? []) {
      contextTags.add(tag);
    }

    const recommendations = result.results
      .slice(0, this.config.maxCandidates)
      .map((candidate) => {
        const normalizedScore = normalizedScores.get(candidate.id) ?? 0;
        const linkScore = this.computeLinkScore(candidate.id, contextWeights);
        const tagScore = this.computeTagScore(candidate.tags ?? [], contextTags);
        const contextScore = contextWeights.get(candidate.id) ?? 0;
        const finalScore =
          normalizedScore * this.config.scoring.baseWeight +
          clamp(linkScore) * this.config.scoring.linkWeight +
          clamp(tagScore) * this.config.scoring.tagWeight +
          clamp(contextScore) * this.config.scoring.contextWeight;

        const reasons: string[] = [`검색 점수 ${(normalizedScore * 100).toFixed(0)}점`];
        if (linkScore > 0) {
          reasons.push(`링크 신호 +${(linkScore * 100).toFixed(0)}`);
        }
        if (tagScore > 0) {
          reasons.push(`태그 일치 +${(tagScore * 100).toFixed(0)}`);
        }
        if (contextScore > 0) {
          reasons.push(`세션 컨텍스트 +${(contextScore * 100).toFixed(0)}`);
        }

        return {
          id: candidate.id,
          title: candidate.title,
          score: Number(finalScore.toFixed(4)),
          category: candidate.category,
          filePath: candidate.filePath,
          snippet: candidate.snippet,
          tags: candidate.tags ?? [],
          links: candidate.links ?? [],
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      sessionId: parsed.sessionId,
      recommendations,
      totalCandidates: result.totalCount,
      metrics: {
        tookMs: Date.now() - start,
        maxScore: result.results.reduce((max, item) => Math.max(max, item.score), 0),
      },
    };
  }

  private computeLinkScore(candidateId: string, contextWeights: Map<string, number>): number {
    if (contextWeights.size === 0) {
      return 0;
    }

    const outgoing = this.searchEngine.getOutgoingLinks(candidateId) ?? [];
    const backlinks = this.searchEngine.getBacklinks(candidateId) ?? [];
    let cumulative = 0;

    for (const relation of [...outgoing, ...backlinks]) {
      const weight =
        contextWeights.get(relation.sourceUid) ??
        contextWeights.get(relation.targetUid) ??
        0;
      if (weight > 0) {
        cumulative += weight * relation.strength;
      }
    }

    const normalized = cumulative / contextWeights.size;
    return clamp(normalized);
  }

  private computeTagScore(candidateTags: string[], contextTags: Set<string>): number {
    if (contextTags.size === 0 || candidateTags.length === 0) {
      return 0;
    }

    const normalizedCandidateTags = new Set(candidateTags.map((tag) => tag.toLowerCase()));
    let matches = 0;
    for (const tag of contextTags) {
      if (normalizedCandidateTags.has(tag.toLowerCase())) {
        matches += 1;
      }
    }
    return matches / contextTags.size;
  }
}
