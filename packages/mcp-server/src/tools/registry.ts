/**
 * MCP Tool Registry - 도구 정의 및 실행
 */

import path from 'path';
import {
  ErrorCode,
  MemoryMcpError,
  createLogEntry,
  maskSensitiveInfo,
  generateUid,
  type Uid,
} from '@memory-mcp/common';
import {
  createNewNote,
  saveNote,
  findNoteByUid,
  loadAllNotes,
  sanitizeFileName,
  normalizePath,
  generateNoteMetadata,
  analyzeLinks,
  updateFrontMatter,
  deleteFile,
} from '@memory-mcp/storage-md';
import { IndexSearchEngine } from '@memory-mcp/index-search';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CreateNoteInputSchema,
  ReadNoteInputSchema,
  ListNotesInputSchema,
  SearchMemoryInputSchema,
  UpdateNoteInputSchema,
  DeleteNoteInputSchema,
  ToolName,
  ToolNameSchema,
  type CreateNoteInput,
  type ReadNoteInput,
  type ListNotesInput,
  type SearchMemoryInput,
  type UpdateNoteInput,
  type DeleteNoteInput,
} from './schemas.js';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
} from './types.js';
import {
  DEFAULT_EXECUTION_POLICY,
  withExecutionPolicy,
} from './execution-policy.js';

type JsonSchema = ReturnType<typeof zodToJsonSchema>;

/**
 * IndexSearchEngine 인스턴스 캐시 (lazy initialization)
 */
let searchEngineCache: IndexSearchEngine | null = null;

/**
 * IndexSearchEngine 인스턴스를 가져오거나 생성합니다.
 */
function getSearchEngine(context: ToolExecutionContext): IndexSearchEngine {
  if (!searchEngineCache) {
    searchEngineCache = new IndexSearchEngine({
      dbPath: context.indexPath,
      tokenizer: 'unicode61',
      walMode: true,
    });
    context.logger.info('IndexSearchEngine 인스턴스 생성됨', {
      dbPath: context.indexPath,
    });
  }
  return searchEngineCache;
}

/**
 * Helper: 파일 경로 생성
 */
function generateFilePath(
  vaultPath: string,
  title: string,
  uid: string
): string {
  const sanitizedTitle = sanitizeFileName(title).toLowerCase().slice(0, 50);
  const fileName = `${sanitizedTitle}-${uid}.md`;
  return normalizePath(path.join(vaultPath, fileName));
}

/**
 * Tool: search_memory (FTS5 기반 전문 검색)
 */
const searchMemoryDefinition: ToolDefinition<typeof SearchMemoryInputSchema> = {
  name: 'search_memory',
  description:
    '메모리 볼트에서 FTS5 기반 전문 검색을 수행합니다. 키워드, 카테고리, 태그로 필터링할 수 있습니다.',
  schema: SearchMemoryInputSchema,
  async handler(
    input: SearchMemoryInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const { query, limit = 10, category, tags = [] } = input;

    try {
      const searchEngine = getSearchEngine(context);

      // 검색 옵션 구성 (exactOptionalPropertyTypes 고려)
      const searchOptions: {
        limit: number;
        category?: string;
        tags?: string[];
      } = {
        limit,
      };
      if (category) {
        searchOptions.category = category;
      }
      if (tags.length > 0) {
        searchOptions.tags = tags;
      }

      // 전문 검색 수행
      const searchResult = await searchEngine.search(query, searchOptions);

      // 결과가 없는 경우
      if (searchResult.results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `검색 결과가 없습니다.

검색 쿼리: ${query}
카테고리 필터: ${category ?? '(없음)'}
태그 필터: ${tags.join(', ') || '(없음)'}

힌트: 다른 키워드를 시도하거나 필터 조건을 완화해보세요.`,
            },
          ],
          _meta: {
            metadata: {
              query,
              category: category ?? null,
              tags,
              limit,
              totalResults: 0,
              searchTimeMs: searchResult.metrics.totalTimeMs,
            },
          },
        };
      }

      // 결과를 텍스트로 포맷팅
      const resultsText = searchResult.results
        .map((result: any, index: number) => {
          return `${index + 1}. **${result.title}** (${result.category})
   ID: ${result.id}
   Score: ${result.score.toFixed(2)}
   Tags: ${result.tags.join(', ') || '(없음)'}
   Path: ${result.filePath}

   ${result.snippet}

   Links: ${result.links.length > 0 ? result.links.join(', ') : '(없음)'}`;
        })
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `검색 완료: "${query}"

총 ${searchResult.totalCount}개 결과 중 ${searchResult.results.length}개 표시
검색 시간: ${searchResult.metrics.totalTimeMs.toFixed(2)}ms

${resultsText}`,
          },
        ],
        _meta: {
          metadata: {
            query,
            category: category ?? null,
            tags,
            limit,
            totalResults: searchResult.totalCount,
            returnedResults: searchResult.results.length,
            searchTimeMs: searchResult.metrics.totalTimeMs,
            metrics: searchResult.metrics,
          },
        },
      };
    } catch (error) {
      context.logger.error('검색 중 오류 발생', { error, query });
      throw new MemoryMcpError(
        ErrorCode.INTERNAL_ERROR,
        `검색 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
        { query, category, tags }
      );
    }
  },
};

/**
 * Tool: create_note
 */
const createNoteDefinition: ToolDefinition<typeof CreateNoteInputSchema> = {
  name: 'create_note',
  description: '새로운 Markdown 노트를 생성합니다.',
  schema: CreateNoteInputSchema,
  async handler(
    input: CreateNoteInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const { title, content, category, tags, project, links } = input;

    try {
      // Generate UID
      const uid = generateUid();

      // Generate file path
      const filePath = generateFilePath(context.vaultPath, title, uid);

      context.logger.debug(
        `[tool:create_note] 노트 생성 시작`,
        createLogEntry('debug', 'create_note.start', {
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
        createLogEntry('info', 'create_note.success', {
          uid: note.frontMatter.id,
          title: note.frontMatter.title,
          filePath: note.filePath,
        })
      );

      return {
        content: [
          {
            type: 'text',
            text: `✓ 노트가 생성되었습니다.

**ID**: ${note.frontMatter.id}
**제목**: ${note.frontMatter.title}
**카테고리**: ${note.frontMatter.category || '(없음)'}
**태그**: ${note.frontMatter.tags.join(', ') || '(없음)'}
**프로젝트**: ${note.frontMatter.project || '(없음)'}
**파일**: ${path.basename(note.filePath)}
**생성 시간**: ${note.frontMatter.created}`,
          },
        ],
        _meta: {
          metadata: {
            id: note.frontMatter.id,
            title: note.frontMatter.title,
            category: note.frontMatter.category || null,
            tags: note.frontMatter.tags,
            project: note.frontMatter.project || null,
            filePath: note.filePath,
            created: note.frontMatter.created,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:create_note] 노트 생성 실패`,
        createLogEntry('error', 'create_note.error', {
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
  name: 'read_note',
  description:
    'UID로 노트를 조회합니다. 옵션으로 메타데이터와 링크 분석을 포함할 수 있습니다.',
  schema: ReadNoteInputSchema,
  async handler(
    input: ReadNoteInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const { uid, includeMetadata = false, includeLinks = false } = input;

    try {
      context.logger.debug(
        `[tool:read_note] 노트 조회 시작: ${uid}`,
        createLogEntry('debug', 'read_note.start', { uid })
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
**카테고리**: ${note.frontMatter.category || '(없음)'}
**태그**: ${note.frontMatter.tags.join(', ') || '(없음)'}
**프로젝트**: ${note.frontMatter.project || '(없음)'}
**생성**: ${note.frontMatter.created}
**수정**: ${note.frontMatter.updated}
**링크**: ${note.frontMatter.links.join(', ') || '(없음)'}

---

${note.content}`;

      // Build metadata
      const metadata: any = {
        id: note.frontMatter.id,
        title: note.frontMatter.title,
        category: note.frontMatter.category || null,
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
        createLogEntry('info', 'read_note.success', { uid })
      );

      return {
        content: [{ type: 'text', text: responseText }],
        _meta: { metadata },
      };
    } catch (error) {
      if (error instanceof MemoryMcpError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:read_note] 노트 조회 실패: ${uid}`,
        createLogEntry('error', 'read_note.error', { uid, error: errorMessage })
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
  name: 'list_notes',
  description:
    '볼트의 노트 목록을 조회합니다. 카테고리, 태그, 프로젝트로 필터링할 수 있습니다.',
  schema: ListNotesInputSchema,
  async handler(
    input: ListNotesInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const {
      category,
      tags,
      project,
      limit = 100,
      offset = 0,
      sortBy = 'updated',
      sortOrder = 'desc',
    } = input;

    try {
      context.logger.debug(
        `[tool:list_notes] 목록 조회 시작`,
        createLogEntry('debug', 'list_notes.start', {
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
        createLogEntry('debug', 'list_notes.loaded', { total: allNotes.length })
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
          case 'created':
            aValue = a.frontMatter.created;
            bValue = b.frontMatter.created;
            break;
          case 'updated':
            aValue = a.frontMatter.updated;
            bValue = b.frontMatter.updated;
            break;
          case 'title':
            aValue = a.frontMatter.title.toLowerCase();
            bValue = b.frontMatter.title.toLowerCase();
            break;
          default:
            aValue = a.frontMatter.updated;
            bValue = b.frontMatter.updated;
        }

        const comparison = aValue.localeCompare(bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
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
        if (tags && tags.length > 0)
          responseText += `- 태그: ${tags.join(', ')}\n`;
        if (project) responseText += `- 프로젝트: ${project}\n`;
      }

      responseText += `\n---\n\n`;

      paginatedNotes.forEach((note: any, index: number) => {
        responseText += `${offset + index + 1}. **${note.frontMatter.title}**
   - ID: \`${note.frontMatter.id}\`
   - 카테고리: ${note.frontMatter.category || '(없음)'}
   - 태그: ${note.frontMatter.tags.join(', ') || '(없음)'}
   - 업데이트: ${note.frontMatter.updated}
   - 링크: ${note.frontMatter.links.length}개

`;
      });

      if (offset + limit < total) {
        responseText += `\n⋯ 더 많은 결과가 있습니다. offset=${offset + limit}로 다음 페이지를 확인하세요.`;
      }

      context.logger.info(
        `[tool:list_notes] 목록 조회 완료`,
        createLogEntry('info', 'list_notes.success', {
          total,
          filtered: paginatedNotes.length,
          filters: { category, tags, project },
        })
      );

      return {
        content: [{ type: 'text', text: responseText }],
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      context.logger.error(
        `[tool:list_notes] 목록 조회 실패`,
        createLogEntry('error', 'list_notes.error', { error: errorMessage })
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
 * Tool: update_note
 */
const updateNoteDefinition: ToolDefinition<typeof UpdateNoteInputSchema> = {
  name: 'update_note',
  description:
    '기존 노트를 업데이트합니다. 제목, 내용, 카테고리, 태그, 프로젝트, 링크를 수정할 수 있습니다.',
  schema: UpdateNoteInputSchema,
  async handler(
    input: UpdateNoteInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const { uid, title, content, category, tags, project, links } = input;

    try {
      context.logger.debug(`[tool:update_note] 노트 업데이트 시작`, { uid });

      // 1. 노트 파일 찾기
      const noteResult = await findNoteByUid(uid, context.vaultPath);
      if (!noteResult) {
        throw new MemoryMcpError(
          ErrorCode.RESOURCE_NOT_FOUND,
          `UID에 해당하는 노트를 찾을 수 없습니다: ${uid}`,
          { uid }
        );
      }

      // 2. 노트 로드 (findNoteByUid가 이미 노트를 반환함)
      const existingNote = noteResult;

      // 3. Front Matter 업데이트 (exactOptionalPropertyTypes 고려)
      const frontMatterUpdates: any = {};
      if (title !== undefined) frontMatterUpdates.title = title;
      if (category !== undefined) frontMatterUpdates.category = category;
      if (tags !== undefined) frontMatterUpdates.tags = tags;
      if (project !== undefined) {
        frontMatterUpdates.project = project === null ? undefined : project;
      }
      if (links !== undefined) frontMatterUpdates.links = links;

      const updatedFrontMatter = updateFrontMatter(
        existingNote.frontMatter,
        frontMatterUpdates
      );

      // 4. 업데이트된 노트 구성
      const updatedNote = {
        ...existingNote,
        frontMatter: updatedFrontMatter,
        content: content !== undefined ? content : existingNote.content,
      };

      // 5. 저장
      await saveNote(updatedNote);

      // 6. 검색 인덱스 업데이트
      try {
        const searchEngine = getSearchEngine(context);
        searchEngine.indexNote(updatedNote);
        context.logger.debug(`[tool:update_note] 검색 인덱스 업데이트 완료`, {
          uid,
        });
      } catch (indexError) {
        // 인덱스 업데이트 실패는 경고만 로깅
        context.logger.warn(
          `[tool:update_note] 검색 인덱스 업데이트 실패 (무시됨)`,
          { uid, error: indexError }
        );
      }

      context.logger.info(`[tool:update_note] 노트 업데이트 완료`, {
        uid,
        title: updatedNote.frontMatter.title,
      });

      // 7. 응답 생성
      const updatedFields: string[] = [];
      if (title) updatedFields.push('제목');
      if (content !== undefined) updatedFields.push('내용');
      if (category) updatedFields.push('카테고리');
      if (tags) updatedFields.push('태그');
      if (project !== undefined) updatedFields.push('프로젝트');
      if (links) updatedFields.push('링크');

      return {
        content: [
          {
            type: 'text',
            text: `노트가 성공적으로 업데이트되었습니다.

**UID**: ${uid}
**제목**: ${updatedNote.frontMatter.title}
**카테고리**: ${updatedNote.frontMatter.category || '(없음)'}
**태그**: ${updatedNote.frontMatter.tags.join(', ') || '(없음)'}
**프로젝트**: ${updatedNote.frontMatter.project || '(없음)'}
**링크**: ${updatedNote.frontMatter.links.length}개
**업데이트 시간**: ${updatedNote.frontMatter.updated}

**업데이트된 필드**: ${updatedFields.join(', ')}`,
          },
        ],
        _meta: {
          metadata: {
            uid,
            title: updatedNote.frontMatter.title,
            category: updatedNote.frontMatter.category || null,
            tags: updatedNote.frontMatter.tags,
            project: updatedNote.frontMatter.project || null,
            updated: updatedNote.frontMatter.updated,
            updatedFields,
          },
        },
      };
    } catch (error) {
      if (error instanceof MemoryMcpError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.logger.error(`[tool:update_note] 노트 업데이트 실패`, {
        uid,
        error: errorMessage,
      });

      throw new MemoryMcpError(
        ErrorCode.STORAGE_ERROR,
        `노트 업데이트 실패: ${errorMessage}`,
        { uid }
      );
    }
  },
};

/**
 * Tool: delete_note
 */
const deleteNoteDefinition: ToolDefinition<typeof DeleteNoteInputSchema> = {
  name: 'delete_note',
  description:
    '노트를 삭제합니다. 삭제는 되돌릴 수 없으므로 confirm=true를 명시적으로 전달해야 합니다.',
  schema: DeleteNoteInputSchema,
  async handler(
    input: DeleteNoteInput,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const { uid, confirm } = input;

    // confirm 체크 (스키마에서도 체크하지만 이중 확인)
    if (!confirm) {
      throw new MemoryMcpError(
        ErrorCode.SCHEMA_VALIDATION_ERROR,
        '노트 삭제를 확인하려면 confirm=true를 전달해야 합니다.',
        { uid }
      );
    }

    try {
      context.logger.debug(`[tool:delete_note] 노트 삭제 시작`, { uid });

      // 1. 노트 파일 찾기
      const noteToDelete = await findNoteByUid(uid, context.vaultPath);
      if (!noteToDelete) {
        throw new MemoryMcpError(
          ErrorCode.RESOURCE_NOT_FOUND,
          `UID에 해당하는 노트를 찾을 수 없습니다: ${uid}`,
          { uid }
        );
      }

      // 2. 노트 정보 추출 (응답용)
      const noteInfo = {
        uid: noteToDelete.frontMatter.id,
        title: noteToDelete.frontMatter.title,
        category: noteToDelete.frontMatter.category,
        filePath: noteToDelete.filePath,
      };

      // 3. 파일 삭제
      await deleteFile(noteToDelete.filePath);

      // 4. 검색 인덱스에서 제거
      try {
        const searchEngine = getSearchEngine(context);
        searchEngine.removeNote(uid);
        context.logger.debug(`[tool:delete_note] 검색 인덱스 삭제 완료`, {
          uid,
        });
      } catch (indexError) {
        // 인덱스 삭제 실패는 경고만 로깅
        context.logger.warn(
          `[tool:delete_note] 검색 인덱스 삭제 실패 (무시됨)`,
          { uid, error: indexError }
        );
      }

      context.logger.info(`[tool:delete_note] 노트 삭제 완료`, noteInfo);

      return {
        content: [
          {
            type: 'text',
            text: `노트가 성공적으로 삭제되었습니다.

**UID**: ${noteInfo.uid}
**제목**: ${noteInfo.title}
**카테고리**: ${noteInfo.category}
**파일 경로**: ${noteInfo.filePath}

⚠️ 이 작업은 되돌릴 수 없습니다.`,
          },
        ],
        _meta: {
          metadata: {
            ...noteInfo,
            deletedAt: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      if (error instanceof MemoryMcpError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.logger.error(`[tool:delete_note] 노트 삭제 실패`, {
        uid,
        error: errorMessage,
      });

      throw new MemoryMcpError(
        ErrorCode.STORAGE_ERROR,
        `노트 삭제 실패: ${errorMessage}`,
        { uid }
      );
    }
  },
};

/**
 * Tool Map (MVP 확장: 6 tools)
 */
type RegisteredTool =
  | typeof searchMemoryDefinition
  | typeof createNoteDefinition
  | typeof readNoteDefinition
  | typeof listNotesDefinition
  | typeof updateNoteDefinition
  | typeof deleteNoteDefinition;

const toolMap: Record<ToolName, RegisteredTool> = {
  search_memory: searchMemoryDefinition,
  create_note: createNoteDefinition,
  read_note: readNoteDefinition,
  list_notes: listNotesDefinition,
  update_note: updateNoteDefinition,
  delete_note: deleteNoteDefinition,
};

const toolDefinitions: RegisteredTool[] = [
  searchMemoryDefinition,
  createNoteDefinition,
  readNoteDefinition,
  listNotesDefinition,
  updateNoteDefinition,
  deleteNoteDefinition,
];

function toJsonSchema(definition: RegisteredTool): JsonSchema {
  const schema = zodToJsonSchema(definition.schema, {
    name: definition.name,
    target: 'jsonSchema7',
    $refStrategy: 'none', // MCP에서는 $ref 없이 인라인 스키마가 필요
  });

  // MCP 프로토콜은 최상위 type이 "object"이어야 함
  if (schema && typeof schema === 'object' && !('type' in schema)) {
    return { ...schema, type: 'object' } as JsonSchema;
  }

  return schema;
}

/**
 * List all available tools
 */
export function listTools(): Array<{
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
}> {
  return toolDefinitions.map(definition => ({
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
  overrides?: Partial<ToolExecutionContext['policy']>
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

  const parsedInput = await definition.schema
    .parseAsync(rawInput)
    .catch((error: unknown) => {
      throw new MemoryMcpError(
        ErrorCode.SCHEMA_VALIDATION_ERROR,
        '툴 입력이 유효하지 않습니다.',
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
    createLogEntry('debug', 'tool.start', {
      name: definition.name,
      inputPreview: maskSensitiveInfo(JSON.stringify(parsedInput)).slice(
        0,
        200
      ),
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
            createLogEntry('warn', 'tool.retry', {
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
      createLogEntry('info', 'tool.success', {
        duration,
        name: definition.name,
      })
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    context.logger.error(
      `[tool:${definition.name}] 실행 실패 (${duration}ms)`,
      createLogEntry('error', 'tool.failure', {
        duration,
        name: definition.name,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    throw error;
  }
}
