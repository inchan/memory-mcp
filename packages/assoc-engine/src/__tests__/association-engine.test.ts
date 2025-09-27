import { AssociationEngine } from "../association-engine.js";
import { AssociationRequestSchema } from "../schemas.js";
import type {
  AssociationEngineConfig,
  AssociationRequest,
  SearchEngineAdapter,
} from "../types.js";
import type {
  EnhancedSearchResult,
  LinkGraphNode,
  LinkRelation,
  SearchOptions,
} from "@memory-mcp/index-search";

class StubSearchEngine implements SearchEngineAdapter {
  public readonly calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(
    private readonly result: EnhancedSearchResult,
    private readonly backlinks: Record<string, LinkRelation[]>,
    private readonly graph: Record<string, LinkGraphNode[]>
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<EnhancedSearchResult> {
    this.calls.push({ method: "search", args: [query, options] });
    return this.result;
  }

  getBacklinks(noteUid: string): LinkRelation[] {
    this.calls.push({ method: "getBacklinks", args: [noteUid] });
    return this.backlinks[noteUid] ?? [];
  }

  getOutgoingLinks(noteUid: string): LinkRelation[] {
    this.calls.push({ method: "getOutgoingLinks", args: [noteUid] });
    return this.graph[noteUid]?.map((node) => ({
      sourceUid: noteUid,
      targetUid: node.id,
      linkType: "internal" as const,
      strength: node.score ?? 0.1,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    })) ?? [];
  }

  getConnectedNodes(noteUid: string): LinkGraphNode[] {
    this.calls.push({ method: "getConnectedNodes", args: [noteUid] });
    return this.graph[noteUid] ?? [];
  }
}

describe("AssociationEngine", () => {
  const baseResult: EnhancedSearchResult = {
    results: [
      {
        id: "note-1",
        title: "Graph Search Strategies",
        category: "Projects",
        snippet: "Discusses graph traversal and scoring.",
        score: 0.78,
        filePath: "Projects/graph-search.md",
        tags: ["graph", "search"],
        links: ["note-2", "note-3"],
      },
      {
        id: "note-2",
        title: "Link Analysis Heuristics",
        category: "Resources",
        snippet: "How to combine link metrics with BM25.",
        score: 0.68,
        filePath: "Resources/link-analysis.md",
        tags: ["graph", "ranking"],
        links: ["note-1"],
      },
      {
        id: "note-3",
        title: "Session Context Design",
        category: "Areas",
        snippet: "Maintaining state across recommendations.",
        score: 0.32,
        filePath: "Areas/session-context.md",
        tags: ["session", "context"],
        links: ["note-4"],
      },
    ],
    metrics: {
      queryTimeMs: 10,
      processingTimeMs: 5,
      totalTimeMs: 15,
      totalResults: 3,
      returnedResults: 3,
      cacheHit: false,
    },
    totalCount: 3,
  };

  const backlinks: Record<string, LinkRelation[]> = {
    "note-1": [
      {
        sourceUid: "note-5",
        targetUid: "note-1",
        linkType: "internal",
        strength: 0.4,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ],
    "note-2": [
      {
        sourceUid: "note-1",
        targetUid: "note-2",
        linkType: "internal",
        strength: 0.8,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ],
  };

  const graph: Record<string, LinkGraphNode[]> = {
    "note-1": [
      {
        id: "note-2",
        title: "Link Analysis Heuristics",
        category: "Resources",
        filePath: "Resources/link-analysis.md",
        links: ["note-1"],
        score: 0.6,
      },
      {
        id: "note-3",
        title: "Session Context Design",
        category: "Areas",
        filePath: "Areas/session-context.md",
        links: ["note-4"],
        score: 0.2,
      },
    ],
  };

  const engineConfig: AssociationEngineConfig = {
    defaultLimit: 5,
    scoring: {
      baseWeight: 0.5,
      linkWeight: 0.3,
      tagWeight: 0.15,
      contextWeight: 0.05,
    },
    timeoutMs: 250,
  };

  it("ranks candidates using link and tag signals", async () => {
    const stub = new StubSearchEngine(baseResult, backlinks, graph);
    const engine = new AssociationEngine(stub, engineConfig);

    const request: AssociationRequest = {
      sessionId: "session-1",
      query: "graph",
      limit: 3,
      contextNotes: [
        { id: "note-2", weight: 1, tags: ["graph"] },
        { id: "note-7", weight: 0.5, tags: ["context"] },
      ],
      tags: ["graph"],
    };

    const result = await engine.generateRecommendations(request);

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]?.id).toBe("note-2");
    expect(result.recommendations[1]?.id).toBe("note-1");
    expect(result.recommendations[2]?.id).toBe("note-3");

    const [first] = result.recommendations;
    expect(first?.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("검색 점수"),
        expect.stringContaining("링크"),
      ])
    );

    expect(stub.calls.filter((call) => call.method === "search")).toHaveLength(1);
  });

  it("enforces timeout limits", async () => {
    const stub = new StubSearchEngine(baseResult, backlinks, graph);
    const engine = new AssociationEngine(stub, { ...engineConfig, timeoutMs: 1 });

    const slowSearch = jest.spyOn(stub, "search").mockImplementationOnce(
      async (query: string, options: SearchOptions) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return baseResult;
      }
    );

    await expect(
      engine.generateRecommendations({
        sessionId: "session-1",
        query: "graph",
      })
    ).rejects.toThrow(/timeout/i);

    expect(slowSearch).toHaveBeenCalled();
  });

  it("validates request payloads with zod schema", async () => {
    const stub = new StubSearchEngine(baseResult, backlinks, graph);
    const engine = new AssociationEngine(stub, engineConfig);

    const invalidPayload = { sessionId: "s-1", query: "", limit: -1 };

    const validation = AssociationRequestSchema.safeParse(invalidPayload);
    expect(validation.success).toBe(false);

    await expect(engine.generateRecommendations(invalidPayload as any)).rejects.toThrow(
      /validation/i
    );
  });
});
