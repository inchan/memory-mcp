import {
  ErrorCode,
  MemoryMcpError,
  maskSensitiveInfo,
  type LogLevel,
} from "@memory-mcp/common";
import {
  createNewNote,
  saveNote,
} from "@memory-mcp/storage-md";
import {
  createDefaultSearchEngine,
  SearchEngine,
} from "@memory-mcp/index-search";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as path from "path";
import {
  CreateNoteInputSchema,
  SearchMemoryInputSchema,
  ToolName,
  ToolNameSchema,
  type CreateNoteInput,
  type SearchMemoryInput,
} from "./schemas.js";
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
} from "./types.js";
import {
  DEFAULT_EXECUTION_POLICY,
  withExecutionPolicy,
  type ExecutionPolicyOptions,
} from "./execution-policy.js";

type JsonSchema = ReturnType<typeof zodToJsonSchema>;

function logToolEvent(
  context: ToolExecutionContext,
  level: LogLevel,
  tool: ToolName,
  message: string,
  metadata?: Record<string, unknown>,
  event?: string
): void {
  const payload = event
    ? { event, ...(metadata ?? {}) }
    : metadata;

  if (payload && Object.keys(payload).length > 0) {
    context.logger[level](`[tool:${tool}] ${message}`, payload);
  } else {
    context.logger[level](`[tool:${tool}] ${message}`);
  }
}

// 검색 엔진 인스턴스 캐시 (indexPath 기준)
const searchEngineCache = new Map<string, SearchEngine>();
let searchEngineFactory: (indexPath: string) => SearchEngine =
  createDefaultSearchEngine;

function resolveIndexPath(context: ToolExecutionContext): string {
  const rawIndexPath = context.indexPath?.trim();
  if (!rawIndexPath) {
    return path.join(context.vaultPath, ".memory-index.db");
  }

  if (path.isAbsolute(rawIndexPath)) {
    return rawIndexPath;
  }

  return path.resolve(context.vaultPath, rawIndexPath);
}

function getSearchEngine(context: ToolExecutionContext): SearchEngine {
  const resolvedIndexPath = resolveIndexPath(context);
  const cached = searchEngineCache.get(resolvedIndexPath);

  if (cached) {
    return cached;
  }

  const engine = searchEngineFactory(resolvedIndexPath);
  searchEngineCache.set(resolvedIndexPath, engine);
  return engine;
}

export function resetToolRegistryForTests(): void {
  searchEngineCache.clear();
  searchEngineFactory = createDefaultSearchEngine;
}

export function getCachedSearchEnginePathsForTests(): string[] {
  return Array.from(searchEngineCache.keys());
}

export function resolveIndexPathForTests(context: ToolExecutionContext): string {
  return resolveIndexPath(context);
}

export function getSearchEngineForTests(
  context: ToolExecutionContext
): SearchEngine {
  return getSearchEngine(context);
}

export function setSearchEngineFactoryForTests(
  factory?: (indexPath: string) => SearchEngine
): void {
  searchEngineFactory = factory ?? createDefaultSearchEngine;
}

const searchMemoryDefinition: ToolDefinition<typeof SearchMemoryInputSchema> = {
  name: "search_memory",
  description: "메모리 볼트에서 키워드를 검색합니다. FTS 및 링크 그래프 기반 하이브리드 검색을 지원합니다.",
  schema: SearchMemoryInputSchema,
  async handler(input: SearchMemoryInput, context: ToolExecutionContext): Promise<ToolResult> {
    const { query, limit = 10, category, tags = [] } = input;
    const maskedQuery = maskSensitiveInfo(query);
    const normalizedTags = tags.length > 0 ? tags : undefined;

    logToolEvent(
      context,
      "info",
      "search_memory",
      "검색 요청 수신",
      {
        query: maskedQuery,
        limit,
        category: category ?? null,
        tags: normalizedTags ?? [],
      },
      "search_memory"
    );

    try {
      const searchEngine = getSearchEngine(context);

      // 검색 옵션 구성
      const searchOptions = {
        limit,
        offset: 0,
        category,
        tags: normalizedTags,
        snippetLength: 200,
        highlightTag: "mark",
      };

      // 하이브리드 검색 실행
      const searchResult = await searchEngine.search(query, searchOptions);

      logToolEvent(
        context,
        "info",
        "search_memory",
        "검색 완료",
        {
          query: maskedQuery,
          resultsCount: searchResult.results.length,
          totalCount: searchResult.totalCount,
          timeMs: searchResult.metrics.totalTimeMs,
        },
        "search_memory.success"
      );

      // 검색 결과가 없는 경우
      if (searchResult.results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `검색 결과가 없습니다.\n\n🔍 검색어: "${query}"\n📁 카테고리: ${category ?? "(전체)"}\n🏷️ 태그: ${tags.join(", ") || "(없음)"}\n⏱️ 검색 시간: ${searchResult.metrics.totalTimeMs}ms\n\n💡 검색 팁:\n- 다른 키워드를 시도해보세요\n- 카테고리나 태그 필터를 조정해보세요\n- 더 일반적인 검색어를 사용해보세요`,
            },
          ],
          _meta: {
            metadata: {
              query,
              category: category ?? null,
              tags,
              limit,
              resultsCount: 0,
              totalCount: 0,
              searchTimeMs: searchResult.metrics.totalTimeMs,
            },
          },
        };
      }

      // 검색 결과 포맷팅
      const formattedResults = searchResult.results.map((result, index) => {
        const resultText = [
          `**${index + 1}. ${result.title}**`,
          `📁 ${result.category} | ⭐ ${result.score.toFixed(2)}`,
          `🔗 링크: ${result.links?.length || 0}개`,
          `📄 ${result.filePath}`,
          ``,
          `${result.snippet}`,
          ``,
          `---`,
        ].join('\n');

        return resultText;
      }).join('\n');

      const summaryText = [
        `🔍 **검색 결과** (${searchResult.results.length}/${searchResult.totalCount}개)`,
        ``,
        `**검색 조건:**`,
        `- 검색어: "${query}"`,
        `- 카테고리: ${category ?? "(전체)"}`,
        `- 태그: ${tags.join(", ") || "(없음)"}`,
        `- 검색 시간: ${searchResult.metrics.totalTimeMs}ms`,
        ``,
        `**검색 결과:**`,
        ``,
        formattedResults,
      ].join('\n');

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
        ],
        _meta: {
          metadata: {
            query,
            category: category ?? null,
            tags,
            limit,
            resultsCount: searchResult.results.length,
            totalCount: searchResult.totalCount,
            searchTimeMs: searchResult.metrics.totalTimeMs,
            results: searchResult.results.map(r => ({
              id: r.id,
              title: r.title,
              category: r.category,
              score: r.score,
              filePath: r.filePath,
              links: r.links || [],
            })),
          },
        },
      };

    } catch (error) {
      logToolEvent(
        context,
        "error",
        "search_memory",
        "검색 실패",
        {
          query: maskedQuery,
          error: error instanceof Error ? error.message : String(error),
        },
        "search_memory.failure"
      );

      throw new MemoryMcpError(
        ErrorCode.MCP_TOOL_ERROR,
        `검색에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        { query }
      );
    }
  },
};

const createNoteDefinition: ToolDefinition<typeof CreateNoteInputSchema> = {
  name: "create_note",
  description: "새로운 Markdown 노트를 생성합니다.",
  schema: CreateNoteInputSchema,
  async handler(input: CreateNoteInput, context: ToolExecutionContext): Promise<ToolResult> {
    const maskedContent = maskSensitiveInfo(input.content);

    logToolEvent(
      context,
      "info",
      "create_note",
      "노트 생성 요청 수신",
      {
        vaultPath: context.vaultPath,
        mode: context.mode,
        title: input.title,
      },
      "create_note"
    );

    try {
      // 파일 경로 생성 (제목을 파일명으로 사용, 안전한 문자로 변환)
      const safeFileName = input.title
        .replace(/[^\w\s가-힣]/g, '') // 특수문자 제거 (한글, 영문, 숫자, 공백만 허용)
        .replace(/\s+/g, '_') // 공백을 언더스코어로 변환
        .trim();

      const fileName = `${safeFileName}.md`;
      const filePath = path.join(context.vaultPath, input.category, fileName);

      // 노트 객체 생성
      const note = createNewNote(
        input.title,
        input.content,
        filePath,
        input.category,
        {
          tags: input.tags,
          project: input.project ?? undefined,
          links: input.links ?? [],
        }
      );

      // 실제 파일 저장
      await saveNote(note);

      // 검색 인덱스에 노트 추가
      try {
        const searchEngine = getSearchEngine(context);
        await searchEngine.indexNote(note);

        logToolEvent(
          context,
          "debug",
          "create_note",
          "검색 인덱스 업데이트 완료",
          {
            id: note.frontMatter.id,
          },
          "create_note.index"
        );
      } catch (indexError) {
        // 인덱스 실패는 경고만 기록하고 계속 진행
        logToolEvent(
          context,
          "warn",
          "create_note",
          "검색 인덱스 업데이트 실패",
          {
            id: note.frontMatter.id,
            error:
              indexError instanceof Error
                ? indexError.message
                : String(indexError),
          },
          "create_note.index_failure"
        );
      }

      const noteId = note.frontMatter.id;

      logToolEvent(
        context,
        "info",
        "create_note",
        `노트 생성 완료: ${noteId}`,
        {
          id: noteId,
          filePath: note.filePath,
        },
        "create_note.success"
      );

      return {
        content: [
          {
            type: "text",
            text: `노트가 성공적으로 생성되었습니다.\nID: ${noteId}\n제목: ${input.title}\n파일 경로: ${note.filePath}\n카테고리: ${input.category}\n태그: ${
              input.tags.join(", ") || "(없음)"
            }\n내용 미리보기: ${maskedContent.slice(0, 200)}${
              maskedContent.length > 200 ? "..." : ""
            }`,
          },
        ],
        _meta: {
          metadata: {
            id: noteId,
            title: input.title,
            category: input.category,
            tags: input.tags,
            project: input.project ?? null,
            links: input.links ?? [],
            filePath: note.filePath,
          },
        },
      };
    } catch (error) {
      logToolEvent(
        context,
        "error",
        "create_note",
        "노트 생성 실패",
        {
          title: input.title,
          error: error instanceof Error ? error.message : String(error),
        },
        "create_note.failure"
      );

      throw new MemoryMcpError(
        ErrorCode.MCP_TOOL_ERROR,
        `노트 생성에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`,
        { title: input.title }
      );
    }
  },
};

type RegisteredTool =
  | typeof searchMemoryDefinition
  | typeof createNoteDefinition;

const toolMap: Record<ToolName, RegisteredTool> = {
  search_memory: searchMemoryDefinition,
  create_note: createNoteDefinition,
};

const toolDefinitions: RegisteredTool[] = Object.values(toolMap);

function toJsonSchema(definition: RegisteredTool): JsonSchema {
  return zodToJsonSchema(definition.schema, definition.name);
}

export function listTools(): Array<{
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
}> {
  return toolDefinitions.map((definition) => ({
    name: definition.name as ToolName,
    description: definition.description,
    inputSchema: toJsonSchema(definition),
  }));
}

async function executeToolWithDefinition(
  definition: RegisteredTool,
  rawInput: unknown,
  context: ToolExecutionContext,
  policy: ExecutionPolicyOptions
): Promise<ToolResult> {
  const parsedInput = await definition.schema.parseAsync(rawInput).catch((error: unknown) => {
    throw new MemoryMcpError(
      ErrorCode.SCHEMA_VALIDATION_ERROR,
      "툴 입력이 유효하지 않습니다.",
      {
        validationErrors: error instanceof Error ? error.message : error,
        tool: definition.name,
      }
    );
  });

  const startTime = Date.now();
  logToolEvent(
    context,
    "debug",
    definition.name,
    "실행 시작",
    {
      name: definition.name,
      inputPreview: maskSensitiveInfo(JSON.stringify(parsedInput)).slice(0, 200),
    },
    "tool.start"
  );

  try {
    const result = await withExecutionPolicy<ToolResult>(
      () => definition.handler(parsedInput as any, context),
      {
        ...policy,
        onRetry: ({ attempt, error }) => {
          logToolEvent(
            context,
            "warn",
            definition.name,
            `${attempt}차 시도 실패`,
            {
              attempt,
              error: error instanceof Error ? error.message : String(error),
              name: definition.name,
            },
            "tool.retry"
          );
        },
      }
    );

    const duration = Date.now() - startTime;
    logToolEvent(
      context,
      "info",
      definition.name,
      `실행 완료 (${duration}ms)`,
      {
        duration,
        name: definition.name,
      },
      "tool.success"
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logToolEvent(
      context,
      "error",
      definition.name,
      `실행 실패 (${duration}ms)`,
      {
        duration,
        name: definition.name,
        error: error instanceof Error ? error.message : String(error),
      },
      "tool.failure"
    );

    throw error;
  }
}

export async function executeTool(
  name: ToolName,
  rawInput: unknown,
  context: ToolExecutionContext,
  overrides?: Partial<ToolExecutionContext["policy"]>
): Promise<ToolResult> {
  const parseResult = ToolNameSchema.safeParse(name);
  if (!parseResult.success) {
    throw new MemoryMcpError(
      ErrorCode.MCP_INVALID_REQUEST,
      `알 수 없는 MCP 툴입니다: ${String(name)}`
    );
  }

  const definition = toolMap[parseResult.data];

  if (!definition) {
    throw new MemoryMcpError(
      ErrorCode.MCP_TOOL_ERROR,
      `등록되지 않은 MCP 툴입니다: ${parseResult.data}`
    );
  }

  const policy = {
    ...DEFAULT_EXECUTION_POLICY,
    ...context.policy,
    ...overrides,
  };

  return executeToolWithDefinition(definition, rawInput, context, policy);
}
