/**
 * @memory-mcp/mcp-server/tools
 * MCP 툴 정의 및 관리
 */

/**
 * 메모리 검색 툴 스키마
 */
export const searchMemoryTool = {
  name: "search_memory",
  description: "메모리에서 키워드를 검색하여 관련 노트들을 찾습니다",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색할 키워드 또는 쿼리",
      },
      category: {
        type: "string",
        description: "검색할 PARA 카테고리 (선택사항)",
        enum: ["Projects", "Areas", "Resources", "Archives"],
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "필터링할 태그 목록 (선택사항)",
      },
      limit: {
        type: "number",
        description: "반환할 최대 결과 수 (기본값: 10)",
        minimum: 1,
        maximum: 100,
        default: 10,
      },
    },
    required: ["query"],
  },
} as const;

/**
 * 노트 생성 툴 스키마
 */
export const createNoteTool = {
  name: "create_note",
  description: "새로운 메모리 노트를 생성합니다",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "노트 제목",
      },
      content: {
        type: "string",
        description: "노트 내용 (Markdown 형식)",
      },
      category: {
        type: "string",
        description: "PARA 카테고리",
        enum: ["Projects", "Areas", "Resources", "Archives"],
        default: "Resources",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "노트에 추가할 태그 목록",
      },
      project: {
        type: "string",
        description: "연결할 프로젝트 이름 (선택사항)",
      },
      links: {
        type: "array",
        items: { type: "string" },
        description: "연결할 다른 노트의 ID 목록 (선택사항)",
      },
    },
    required: ["title", "content"],
  },
} as const;

/**
 * 노트 업데이트 툴 스키마
 */
export const updateNoteTool = {
  name: "update_note",
  description: "기존 노트를 업데이트합니다",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "업데이트할 노트의 ID",
      },
      title: {
        type: "string",
        description: "새 제목 (선택사항)",
      },
      content: {
        type: "string",
        description: "새 내용 (선택사항)",
      },
      category: {
        type: "string",
        description: "새 PARA 카테고리 (선택사항)",
        enum: ["Projects", "Areas", "Resources", "Archives"],
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "새 태그 목록 (선택사항)",
      },
      addLinks: {
        type: "array",
        items: { type: "string" },
        description: "추가할 링크 ID 목록 (선택사항)",
      },
      removeLinks: {
        type: "array",
        items: { type: "string" },
        description: "제거할 링크 ID 목록 (선택사항)",
      },
    },
    required: ["id"],
  },
} as const;

/**
 * 노트 삭제 툴 스키마
 */
export const deleteNoteTool = {
  name: "delete_note",
  description: "노트를 삭제합니다",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "삭제할 노트의 ID",
      },
      confirm: {
        type: "boolean",
        description: "삭제 확인 (안전을 위해 필수)",
        default: false,
      },
    },
    required: ["id", "confirm"],
  },
} as const;

/**
 * 링크 그래프 탐색 툴 스키마
 */
export const exploreLinksTool = {
  name: "explore_links",
  description: "노트 간의 링크 관계를 탐색합니다",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "시작점 노트 ID",
      },
      depth: {
        type: "number",
        description: "탐색 깊이 (기본값: 2)",
        minimum: 1,
        maximum: 5,
        default: 2,
      },
      direction: {
        type: "string",
        description: "탐색 방향",
        enum: ["outgoing", "incoming", "both"],
        default: "both",
      },
    },
    required: ["id"],
  },
} as const;

/**
 * 연상 검색 툴 스키마 (Olima 엔진 기반)
 */
export const associativeSearchTool = {
  name: "associative_search",
  description: "세션 컨텍스트를 기반으로 연상 검색을 수행합니다",
  inputSchema: {
    type: "object",
    properties: {
      context: {
        type: "string",
        description: "현재 세션의 컨텍스트 또는 주제",
      },
      previousNotes: {
        type: "array",
        items: { type: "string" },
        description: "이전에 참조한 노트 ID 목록 (선택사항)",
      },
      strength: {
        type: "number",
        description: "연상 강도 (0.0-1.0, 기본값: 0.7)",
        minimum: 0.0,
        maximum: 1.0,
        default: 0.7,
      },
      limit: {
        type: "number",
        description: "반환할 최대 결과 수 (기본값: 5)",
        minimum: 1,
        maximum: 20,
        default: 5,
      },
    },
    required: ["context"],
  },
} as const;

/**
 * 모든 툴을 배열로 내보내기
 */
export const allTools = [
  searchMemoryTool,
  createNoteTool,
  updateNoteTool,
  deleteNoteTool,
  exploreLinksTool,
  associativeSearchTool,
] as const;

/**
 * 툴 이름을 키로 하는 맵
 */
export const toolsMap = {
  search_memory: searchMemoryTool,
  create_note: createNoteTool,
  update_note: updateNoteTool,
  delete_note: deleteNoteTool,
  explore_links: exploreLinksTool,
  associative_search: associativeSearchTool,
} as const;

/**
 * 툴 타입 정의
 */
export type ToolName = keyof typeof toolsMap;
export type Tool = typeof allTools[number];