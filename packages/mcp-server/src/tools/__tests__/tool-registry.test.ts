import { ErrorCode } from "@memory-mcp/common";
import { executeTool, listTools, type ToolExecutionContext } from "..";

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
