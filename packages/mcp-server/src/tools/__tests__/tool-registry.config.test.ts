import type { ToolExecutionContext } from "..";
import * as IndexSearch from "@memory-mcp/index-search";
import * as ExecutionPolicy from "../execution-policy.js";
import { executeTool } from "..";
import {
  getCachedSearchEnginePathsForTests,
  resetToolRegistryForTests,
  resolveIndexPathForTests,
  setSearchEngineFactoryForTests,
} from "../registry.js";

function createContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    vaultPath: "/tmp/vault",
    indexPath: "/tmp/custom-index.db",
    mode: "dev",
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    policy: {
      maxRetries: 2,
      timeoutMs: 1_000,
    },
    ...overrides,
  };
}

describe("tool registry configuration", () => {
  beforeEach(() => {
    resetToolRegistryForTests();
    setSearchEngineFactoryForTests();
    jest.restoreAllMocks();
  });

  it("resolves the configured index path from the tool context", () => {
    const context = createContext({ indexPath: "/var/data/memory/index.db" });

    const resolvedPath = resolveIndexPathForTests(context);

    expect(resolvedPath).toBe("/var/data/memory/index.db");
  });

  it("uses the context indexPath when creating the search engine", async () => {
    const context = createContext({ indexPath: "/var/data/memory/index.db" });
    const searchEngineStub = {
      search: jest.fn().mockResolvedValue({
        results: [],
        totalCount: 0,
        metrics: { totalTimeMs: 5 },
      }),
      indexNote: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof IndexSearch.createDefaultSearchEngine>;
    const factoryStub = jest
      .fn()
      .mockImplementation(() => searchEngineStub);
    setSearchEngineFactoryForTests(factoryStub);

    await executeTool("search_memory", { query: "테스트" }, context);

    expect(factoryStub).toHaveBeenCalledWith("/var/data/memory/index.db");
    expect(getCachedSearchEnginePathsForTests()).toContain("/var/data/memory/index.db");
  });

  it("merges execution policy overrides when running a tool", async () => {
    const context = createContext({
      policy: { maxRetries: 1, timeoutMs: 2_500 },
    });
    const policySpy = jest.spyOn(ExecutionPolicy, "withExecutionPolicy");

    const searchEngineStub = {
      search: jest.fn().mockResolvedValue({
        results: [],
        totalCount: 0,
        metrics: { totalTimeMs: 5 },
      }),
      indexNote: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof IndexSearch.createDefaultSearchEngine>;
    const factoryStub = jest
      .fn()
      .mockImplementation(() => searchEngineStub);
    setSearchEngineFactoryForTests(factoryStub);

    await executeTool("search_memory", { query: "폴리시" }, context, { timeoutMs: 9_999 });

    expect(policySpy).toHaveBeenCalledTimes(1);
    const [, mergedPolicy] = policySpy.mock.calls[0];
    expect(mergedPolicy).toMatchObject({
      maxRetries: 1,
      timeoutMs: 9_999,
    });
    expect(factoryStub).toHaveBeenCalled();
  });
});
