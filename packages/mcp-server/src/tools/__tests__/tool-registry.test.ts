import { ErrorCode } from "@inchan/zettel-memory-common";
import { executeTool, listTools, type ToolExecutionContext } from "..";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function createTestContext(): ToolExecutionContext {
  // Create temporary directory for test database
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-mcp-test-"));
  const indexPath = path.join(tempDir, "test-index.db");

  return {
    vaultPath: "/tmp/vault",
    indexPath,
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

  // TODO: Fix IndexSearchEngine initialization in tests
  it.skip("executes search_memory tool and returns search results", async () => {
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
    // Should mention the query even if no results found
    expect(result.content[0]!.text).toContain("zettelkasten");
    // Should have metadata with search metrics
    expect(result._meta?.metadata).toHaveProperty("query", "zettelkasten");
    expect(result._meta?.metadata).toHaveProperty("totalResults");
    expect(result._meta?.metadata).toHaveProperty("searchTimeMs");
  });

  it("validates input and throws schema validation errors", async () => {
    const context = createTestContext();

    await expect(
      executeTool(
        "create_note",
        { title: "제목만 있습니다" },
        context
      )
    ).rejects.toMatchObject({ code: ErrorCode.SCHEMA_VALIDATION_ERROR });
  });
});
