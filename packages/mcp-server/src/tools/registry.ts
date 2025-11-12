/**
 * MCP Tool Registry - 도구 정의 및 실행
 */

import path from "path";
import {
  ErrorCode,
  MemoryMcpError,
  createLogEntry,
  maskSensitiveInfo,
  generateUid,
  type Uid,
} from "@memory-mcp/common";
import {
  createNewNote,
  saveNote,
  findNoteByUid,
  loadAllNotes,
  sanitizeFileName,
  normalizePath,
  generateNoteMetadata,
  analyzeLinks,
} from "@memory-mcp/storage-md";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  CreateNoteInputSchema,
  ReadNoteInputSchema,
  ListNotesInputSchema,
  SearchMemoryInputSchema,
  ToolName,
  ToolNameSchema,
  type CreateNoteInput,
  type ReadNoteInput,
  type ListNotesInput,
  type SearchMemoryInput,
} from "./schemas.js";
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
} from "./types.js";
import { DEFAULT_EXECUTION_POLICY, withExecutionPolicy } from "./execution-policy.js";

type JsonSchema = ReturnType<typeof zodToJsonSchema>;

/**
 * Helper: 파일 경로 생성
 */
function generateFilePath(vaultPath: string, title: string, uid: string): string {
  const sanitizedTitle = sanitizeFileName(title).toLowerCase().slice(0, 50);
  const fileName = `${sanitizedTitle}-${uid}.md`;
  return normalizePath(path.join(vaultPath, fileName));
}

/**
 * Tool: search_memory (Mock - 추후 index-search 통합)
 */
const searchMemoryDefinition: ToolDefinition<typeof SearchMemoryInputSchema> = {
  name: "search_memory",
  description: "메모리 볼트에서 키워드를 검색합니다. (현재는 기본 구현, 추후 FTS5 통합 예정)",
  schema: SearchMemoryInputSchema,
  async handler(input: SearchMemoryInput): Promise<ToolResult> {
    const { query, limit = 10, category, tags = [] } = input;

    return {
      content: [
        {
          type: "text",
          text: `검색 기능은 index-search 통합 준비 중입니다 (v0.2.0).

현재는 list_notes 도구를 사용하여 노트를 탐색할 수 있습니다.

요청하신 쿼리: ${query}
카테고리: ${category ?? "(지정되지 않음)"}
태그: ${tags.join(", ") || "(없음)"}
최대 결과 수: ${limit}`,
        },
      ],
      _meta: {
        metadata: {
          query,
          category: category ?? null,
          tags,
          limit,
        },
      },
    };
  },
};

/**
 * Tool: create_note
 */
const createNoteDefinition: ToolDefinition<typeof CreateNoteInputSchema> = {
  name: "create_note",
  description: "새로운 Markdown 노트를 생성합니다.",
  schema: CreateNoteInputSchema,
  async handler(input: CreateNoteInput, context: ToolExecutionContext): Promise<ToolResult> {
    const { title, content, category, tags, project, links } = input;

    try {
      // Generate UID
      const uid = generateUid();

      // Generate file path
      const filePath = generateFilePath(context.vaultPath, title, uid);

      context.logger.debug(
        `[tool:create_note] 노트 생성 시작`,
        createLogEntry("debug", "create_note.start", {
          title,
          category,
          uid,
        })
      );

      // Create note object
      const note = createNewNote(title, content, filePath, category, {
        tags,
        project,
        links: links || [],
      });

      // Save to file
      await saveNote(note);

      context.logger.info(
        `[tool:create_note] 노트 생성 완료: ${uid}`,
        createLogEntry("info", "create_note.success", {
          uid: note.frontMatter.id,
          title: note.frontMatter.title,
          filePath: note.filePath,
        })
      );

      return {
        content: [
          {
            type: "text",
            text: `✓ 노트가 생성되었습니다.

**ID**: ${note.frontMatter.id}
**제목**: ${note.frontMatter.title}
**카테고리**: ${note.frontMatter.category}
**태그**: ${note.frontMatter.tags.join(", ") || "(없음)"}
**프로젝트**: ${note.frontMatter.project || "(없음)"}
**파일**: ${path.basename(note.filePath)}
**생성 시간**: ${note.frontMatter.created}`,
          },
        ],
        _meta: {
          metadata: {
            id: note.frontMatter.id,
            title: note.frontMatter.title,
            category: note.frontMatter.category,
            tags: note.frontMatter.tags,
            project: note.frontMatter.project || null,
            filePath: note.filePath,
            created: note.frontMatter.created,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:create_note] 노트 생성 실패`,
        createLogEntry("error", "create_note.error", {
          title,
          error: errorMessage,
        })
      );

      throw new MemoryMcpError(
        ErrorCode.STORAGE_ERROR,
        `노트 생성 실패: ${errorMessage}`,
        { title, category }
      );
    }
  },
};

/**
 * Tool: read_note
 */
const readNoteDefinition: ToolDefinition<typeof ReadNoteInputSchema> = {
  name: "read_note",
  description: "UID로 노트를 조회합니다. 옵션으로 메타데이터와 링크 분석을 포함할 수 있습니다.",
  schema: ReadNoteInputSchema,
  async handler(input: ReadNoteInput, context: ToolExecutionContext): Promise<ToolResult> {
    const { uid, includeMetadata = false, includeLinks = false } = input;

    try {
      context.logger.debug(
        `[tool:read_note] 노트 조회 시작: ${uid}`,
        createLogEntry("debug", "read_note.start", { uid })
      );

      // Find note by UID
      const note = await findNoteByUid(uid as Uid, context.vaultPath);

      if (!note) {
        throw new MemoryMcpError(
          ErrorCode.RESOURCE_NOT_FOUND,
          `UID에 해당하는 노트를 찾을 수 없습니다: ${uid}`,
          { uid }
        );
      }

      // Build response text
      let responseText = `# ${note.frontMatter.title}

**ID**: ${note.frontMatter.id}
**카테고리**: ${note.frontMatter.category}
**태그**: ${note.frontMatter.tags.join(", ") || "(없음)"}
**프로젝트**: ${note.frontMatter.project || "(없음)"}
**생성**: ${note.frontMatter.created}
**수정**: ${note.frontMatter.updated}
**링크**: ${note.frontMatter.links.join(", ") || "(없음)"}

---

${note.content}`;

      // Build metadata
      const metadata: any = {
        id: note.frontMatter.id,
        title: note.frontMatter.title,
        category: note.frontMatter.category,
        tags: note.frontMatter.tags,
        project: note.frontMatter.project || null,
        created: note.frontMatter.created,
        updated: note.frontMatter.updated,
        links: note.frontMatter.links,
        filePath: note.filePath,
      };

      // Optional: Include metadata
      if (includeMetadata) {
        try {
          const noteMetadata = await generateNoteMetadata(note);
          metadata.fileSize = noteMetadata.fileSize;
          metadata.wordCount = noteMetadata.wordCount;
          metadata.characterCount = noteMetadata.characterCount;

          responseText += `

---
**메타데이터**:
- 파일 크기: ${(noteMetadata.fileSize / 1024).toFixed(2)} KB
- 단어 수: ${noteMetadata.wordCount}
- 문자 수: ${noteMetadata.characterCount}`;
        } catch (error) {
          context.logger.warn(`[tool:read_note] 메타데이터 생성 실패`, error);
        }
      }

      // Optional: Include link analysis
      if (includeLinks) {
        try {
          const linkAnalysis = await analyzeLinks(note, context.vaultPath);
          metadata.linkAnalysis = {
            outboundLinks: linkAnalysis.outboundLinks,
            inboundLinksCount: linkAnalysis.inboundLinks.length,
            brokenLinks: linkAnalysis.brokenLinks,
          };

          responseText += `

---
**링크 분석**:
- 아웃바운드 링크: ${linkAnalysis.outboundLinks.length}개
- 백링크: ${linkAnalysis.inboundLinks.length}개
- 깨진 링크: ${linkAnalysis.brokenLinks.length}개`;

          if (linkAnalysis.inboundLinks.length > 0) {
            responseText += `\n\n**백링크 목록**:\n`;
            linkAnalysis.inboundLinks.forEach((bl: any) => {
              responseText += `- [${bl.sourceTitle}](${bl.sourceUid})\n`;
            });
          }
        } catch (error) {
          context.logger.warn(`[tool:read_note] 링크 분석 실패`, error);
        }
      }

      context.logger.info(
        `[tool:read_note] 노트 조회 완료: ${uid}`,
        createLogEntry("info", "read_note.success", { uid })
      );

      return {
        content: [{ type: "text", text: responseText }],
        _meta: { metadata },
      };
    } catch (error) {
      if (error instanceof MemoryMcpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:read_note] 노트 조회 실패: ${uid}`,
        createLogEntry("error", "read_note.error", { uid, error: errorMessage })
      );

      throw new MemoryMcpError(
        ErrorCode.STORAGE_ERROR,
        `노트 조회 실패: ${errorMessage}`,
        { uid }
      );
    }
  },
};

/**
 * Tool: list_notes
 */
const listNotesDefinition: ToolDefinition<typeof ListNotesInputSchema> = {
  name: "list_notes",
  description: "볼트의 노트 목록을 조회합니다. 카테고리, 태그, 프로젝트로 필터링할 수 있습니다.",
  schema: ListNotesInputSchema,
  async handler(input: ListNotesInput, context: ToolExecutionContext): Promise<ToolResult> {
    const {
      category,
      tags,
      project,
      limit = 100,
      offset = 0,
      sortBy = "updated",
      sortOrder = "desc",
    } = input;

    try {
      context.logger.debug(
        `[tool:list_notes] 목록 조회 시작`,
        createLogEntry("debug", "list_notes.start", {
          filters: { category, tags, project },
        })
      );

      // Load all notes
      const allNotes = await loadAllNotes(context.vaultPath, {
        skipInvalid: true,
        concurrency: 20,
      });

      context.logger.debug(
        `[tool:list_notes] 전체 노트 로드 완료: ${allNotes.length}개`,
        createLogEntry("debug", "list_notes.loaded", { total: allNotes.length })
      );

      // Apply filters
      let filteredNotes = allNotes;

      if (category) {
        filteredNotes = filteredNotes.filter(
          (note: any) => note.frontMatter.category === category
        );
      }

      if (tags && tags.length > 0) {
        filteredNotes = filteredNotes.filter((note: any) =>
          tags.some((tag: string) => note.frontMatter.tags.includes(tag))
        );
      }

      if (project) {
        filteredNotes = filteredNotes.filter(
          (note: any) => note.frontMatter.project === project
        );
      }

      // Sort
      filteredNotes.sort((a: any, b: any) => {
        let aValue: string;
        let bValue: string;

        switch (sortBy) {
          case "created":
            aValue = a.frontMatter.created;
            bValue = b.frontMatter.created;
            break;
          case "updated":
            aValue = a.frontMatter.updated;
            bValue = b.frontMatter.updated;
            break;
          case "title":
            aValue = a.frontMatter.title.toLowerCase();
            bValue = b.frontMatter.title.toLowerCase();
            break;
          default:
            aValue = a.frontMatter.updated;
            bValue = b.frontMatter.updated;
        }

        const comparison = aValue.localeCompare(bValue);
        return sortOrder === "asc" ? comparison : -comparison;
      });

      const total = filteredNotes.length;

      // Apply pagination
      const paginatedNotes = filteredNotes.slice(offset, offset + limit);

      // Build response
      const notesList = paginatedNotes.map((note: any) => ({
        id: note.frontMatter.id,
        title: note.frontMatter.title,
        category: note.frontMatter.category,
        tags: note.frontMatter.tags,
        project: note.frontMatter.project || null,
        created: note.frontMatter.created,
        updated: note.frontMatter.updated,
        linkCount: note.frontMatter.links.length,
      }));

      let responseText = `# 노트 목록

**전체**: ${total}개
**표시**: ${paginatedNotes.length}개 (${offset + 1} - ${offset + paginatedNotes.length})
**정렬**: ${sortBy} (${sortOrder})
`;

      if (category || tags || project) {
        responseText += `\n**필터**:\n`;
        if (category) responseText += `- 카테고리: ${category}\n`;
        if (tags && tags.length > 0) responseText += `- 태그: ${tags.join(", ")}\n`;
        if (project) responseText += `- 프로젝트: ${project}\n`;
      }

      responseText += `\n---\n\n`;

      paginatedNotes.forEach((note: any, index: number) => {
        responseText += `${offset + index + 1}. **${note.frontMatter.title}**
   - ID: \`${note.frontMatter.id}\`
   - 카테고리: ${note.frontMatter.category}
   - 태그: ${note.frontMatter.tags.join(", ") || "(없음)"}
   - 업데이트: ${note.frontMatter.updated}
   - 링크: ${note.frontMatter.links.length}개

`;
      });

      if (offset + limit < total) {
        responseText += `\n⋯ 더 많은 결과가 있습니다. offset=${offset + limit}로 다음 페이지를 확인하세요.`;
      }

      context.logger.info(
        `[tool:list_notes] 목록 조회 완료`,
        createLogEntry("info", "list_notes.success", {
          total,
          filtered: paginatedNotes.length,
          filters: { category, tags, project },
        })
      );

      return {
        content: [{ type: "text", text: responseText }],
        _meta: {
          metadata: {
            total,
            offset,
            limit,
            returned: paginatedNotes.length,
            hasMore: offset + limit < total,
            filters: { category, tags, project },
            sortBy,
            sortOrder,
            notes: notesList,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:list_notes] 목록 조회 실패`,
        createLogEntry("error", "list_notes.error", { error: errorMessage })
      );

      throw new MemoryMcpError(
        ErrorCode.STORAGE_ERROR,
        `노트 목록 조회 실패: ${errorMessage}`,
        { filters: { category, tags, project } }
      );
    }
  },
};

/**
 * Tool Map (MVP: 4 tools)
 */
type RegisteredTool =
  | typeof searchMemoryDefinition
  | typeof createNoteDefinition
  | typeof readNoteDefinition
  | typeof listNotesDefinition;

const toolMap: Record<ToolName, RegisteredTool> = {
  search_memory: searchMemoryDefinition,
  create_note: createNoteDefinition,
  read_note: readNoteDefinition,
  list_notes: listNotesDefinition,
  // v0.2.0+
  update_note: undefined as any,
  delete_note: undefined as any,
};

const toolDefinitions: RegisteredTool[] = [
  searchMemoryDefinition,
  createNoteDefinition,
  readNoteDefinition,
  listNotesDefinition,
];

function toJsonSchema(definition: RegisteredTool): JsonSchema {
  return zodToJsonSchema(definition.schema, definition.name);
}

/**
 * List all available tools
 */
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

/**
 * Execute a tool
 */
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
      `등록되지 않은 MCP 툴입니다: ${parseResult.data} (현재 MVP에서는 create_note, read_note, list_notes, search_memory만 지원)`
    );
  }

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

  const policy = {
    ...DEFAULT_EXECUTION_POLICY,
    ...context.policy,
    ...overrides,
  };

  const startTime = Date.now();
  context.logger.debug(
    `[tool:${definition.name}] 실행 시작`,
    createLogEntry("debug", "tool.start", {
      name: definition.name,
      inputPreview: maskSensitiveInfo(JSON.stringify(parsedInput)).slice(0, 200),
    })
  );

  try {
    const result = await withExecutionPolicy<ToolResult>(
      () => definition.handler(parsedInput as any, context),
      {
        ...policy,
        onRetry: ({ attempt, error }) => {
          context.logger.warn(
            `[tool:${definition.name}] ${attempt}차 시도 실패`,
            createLogEntry("warn", "tool.retry", {
              attempt,
              error: error instanceof Error ? error.message : String(error),
              name: definition.name,
            })
          );
        },
      }
    );

    const duration = Date.now() - startTime;
    context.logger.info(
      `[tool:${definition.name}] 실행 완료 (${duration}ms)`,
      createLogEntry("info", "tool.success", {
        duration,
        name: definition.name,
      })
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    context.logger.error(
      `[tool:${definition.name}] 실행 실패 (${duration}ms)`,
      createLogEntry("error", "tool.failure", {
        duration,
        name: definition.name,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    throw error;
  }
}
