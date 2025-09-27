import { ErrorCode } from "@memory-mcp/common";
import {
  executeTool,
  listTools,
  ToolExecutionContext,
} from "..";
import {
  resetToolRegistryForTests,
  setSearchEngineFactoryForTests,
} from "../registry.js";
import type {
  EnhancedSearchResult,
  LinkGraphNode,
  LinkRelation,
  SearchEngine,
  SearchOptions,
} from "@memory-mcp/index-search";

class StubSearchEngine implements SearchEngine {
  constructor(private readonly result: EnhancedSearchResult) {}

  indexNote = jest.fn();
  removeNote = jest.fn();
  batchIndexNotes = jest.fn();
  getOrphanNotes = jest.fn(() => []);
  getBacklinks = jest.fn((uid: string): LinkRelation[] => [
    {
      sourceUid: "note-context",
      targetUid: uid,
      linkType: "internal",
      strength: 0.6,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
  ]);
  getOutgoingLinks = jest.fn((uid: string): LinkRelation[] => []);
  getConnectedNodes = jest.fn((uid: string): LinkGraphNode[] => []);
  getIndexStats = jest.fn();
  optimize = jest.fn();
  close = jest.fn();

  async search(query: string, options: SearchOptions = {}): Promise<EnhancedSearchResult> {
    return this.result;
  }
}

const stubSearchResult: EnhancedSearchResult = {
  results: [
    {
      id: "note-1",
      title: "Graph Search",
      category: "Projects",
      snippet: "Discusses graph traversal.",
      score: 0.8,
      filePath: "Projects/graph-search.md",
      tags: ["graph"],
      links: ["note-context"],
    },
    {
      id: "note-2",
      title: "Link Analysis",
      category: "Resources",
      snippet: "Link metrics combined with BM25.",
      score: 0.6,
      filePath: "Resources/link-analysis.md",
      tags: ["graph", "ranking"],
      links: [],
    },
  ],
  metrics: {
    queryTimeMs: 5,
    processingTimeMs: 2,
    totalTimeMs: 7,
    totalResults: 2,
    returnedResults: 2,
    cacheHit: false,
  },
  totalCount: 2,
};

function setupSearchEngineStub(): void {
  resetToolRegistryForTests();
  setSearchEngineFactoryForTests(() => new StubSearchEngine(stubSearchResult));
}

function createTestContext(): ToolExecutionContext {
  return {
    vaultPath: "/tmp/vault",
    indexPath: "/tmp/index",
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    policy: {
      maxRetries: 1,
      timeoutMs: 500,
    },
    mode: "dev",
  };
}

describe("tool registry", () => {
  it("exposes search_memory tool with validated schema", () => {
    setupSearchEngineStub();
    const tools = listTools();
    const search = tools.find((tool) => tool.name === "search_memory");

    expect(search).toBeDefined();
    expect(search?.inputSchema).toBeDefined();
    const schemaDefinition =
      search?.inputSchema &&
      "definitions" in search.inputSchema &&
      typeof search.inputSchema.definitions === "object"
        ? (search.inputSchema.definitions as Record<string, any>)
            .search_memory
        : undefined;

    expect(schemaDefinition?.properties?.query).toMatchObject({
      type: "string",
    });
    expect(schemaDefinition?.required).toContain("query");
  });

  it("executes search_memory tool and echoes query in response", async () => {
    setupSearchEngineStub();
    const context = createTestContext();
    const result = await executeTool(
      "search_memory",
      { query: "zettelkasten" },
      context
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text",
    });
    expect(result.content[0]!.text).toContain("zettelkasten");
  });

  it("validates input and throws schema validation errors", async () => {
    setupSearchEngineStub();
    const context = createTestContext();

    await expect(
      executeTool(
        "create_note",
        { title: "제목만 있습니다" },
        context
      )
    ).rejects.toMatchObject({ code: ErrorCode.SCHEMA_VALIDATION_ERROR });
  });

  it("provides association, session, and reflection tools", async () => {
    setupSearchEngineStub();
    const context = createTestContext();

    const associateResult = await executeTool(
      "associate_memory",
      { sessionId: "session-1", query: "graph search" },
      context
    );

    expect(associateResult.content[0]?.text).toContain("연관 추천");
    const recommendations = associateResult._meta?.metadata?.recommendations as Array<{
      id: string;
      score: number;
    }>;
    expect(recommendations).toHaveLength(2);

    const sessionResult = await executeTool(
      "session_context",
      { sessionId: "session-1", operation: "get" },
      context
    );

    expect(
      sessionResult._meta?.metadata?.context?.focusNotes?.length ?? 0
    ).toBeGreaterThan(0);

    const reflectionResult = await executeTool(
      "reflect_session",
      { sessionId: "session-1" },
      context
    );

    expect(reflectionResult.content[0]?.text).toContain("세션 요약");
    expect(reflectionResult._meta?.metadata?.reflection?.keyInsights.length).toBeGreaterThan(0);
  });
});
