import type {
  ReflectionEngineConfig,
  ReflectionRequest,
  ReflectionResult,
} from "./types.js";

const DEFAULT_CONFIG: Required<ReflectionEngineConfig> = {
  maxHighlights: 8,
};

function createSummary(request: ReflectionRequest, highlightCount: number): string {
  const recentQueries = request.queries
    .slice(0, 5)
    .map((entry) => `- ${entry.query}`)
    .join("\n");

  const noteTitles = request.notes.map((note) => `- ${note.title}`).join("\n");

  return [
    `세션 요약 (${request.sessionId})`,
    "",
    "최근 검색/질문:",
    recentQueries || "- (기록 없음)",
    "",
    "참고한 노트:",
    noteTitles || "- (없음)",
    "",
    `하이라이트 개수: ${highlightCount}`,
  ].join("\n");
}

export class ReflectionEngine {
  private readonly config: Required<ReflectionEngineConfig>;

  constructor(config: ReflectionEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  buildReflection(request: ReflectionRequest): ReflectionResult {
    const highlightIndex: Record<string, string[]> = {};
    const keyInsights: string[] = [];
    const seenHighlights = new Set<string>();
    const tags = new Set<string>();

    for (const note of request.notes) {
      for (const tag of note.tags ?? []) {
        tags.add(tag);
      }

      if (note.highlights) {
        for (const highlight of note.highlights) {
          const trimmed = highlight.trim();
          if (!trimmed) {
            continue;
          }

          if (!highlightIndex[trimmed]) {
            highlightIndex[trimmed] = [];
          }
          highlightIndex[trimmed].push(note.id);

          if (!seenHighlights.has(trimmed) && keyInsights.length < this.config.maxHighlights) {
            keyInsights.push(trimmed);
            seenHighlights.add(trimmed);
          }
        }
      }

      if (note.summary && keyInsights.length < this.config.maxHighlights) {
        const summaryHighlight = note.summary.trim();
        if (summaryHighlight && !seenHighlights.has(summaryHighlight)) {
          keyInsights.push(summaryHighlight);
          seenHighlights.add(summaryHighlight);
          highlightIndex[summaryHighlight] = highlightIndex[summaryHighlight] ?? [];
          highlightIndex[summaryHighlight].push(note.id);
        }
      }
    }

    const summary = createSummary(request, keyInsights.length);

    return {
      sessionId: request.sessionId,
      summary,
      keyInsights,
      highlightIndex,
      tags: Array.from(tags),
    };
  }
}
