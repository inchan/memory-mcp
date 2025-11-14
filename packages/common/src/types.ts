/**
 * 공통 타입 정의
 */

/**
 * MCP 툴 결과 타입
 */
export interface McpToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 검색 결과 타입
 */
export interface SearchResult {
  id: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
  filePath: string;
  tags: string[];
  links: string[];
}

/**
 * 링크 그래프 노드
 */
export interface LinkGraphNode {
  id: string;
  title: string;
  category: string;
  tags: string[];
  outgoingLinks: string[];
  incomingLinks: string[];
}

/**
 * 파일 변경 이벤트
 */
export interface FileChangeEvent {
  type: 'created' | 'updated' | 'deleted';
  filePath: string;
  timestamp: Date;
}

/**
 * 로그 레벨
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 구조적 로그 엔트리
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  component?: string;
  operation?: string;
}

/**
 * 인덱스 통계
 */
export interface IndexStats {
  totalNotes: number;
  totalLinks: number;
  lastIndexedAt: string;
  indexSizeBytes: number;
}

/**
 * 성능 메트릭
 */
export interface PerformanceMetrics {
  searchLatencyMs: number;
  indexBuildTimeMs: number;
  memoryUsageMb: number;
  timestamp: string;
}

/**
 * 백링크 문맥 정보
 */
export interface BacklinkContext {
  /** 백링크 소스 노트 UID */
  sourceUid: string;
  /** 백링크 소스 노트 제목 */
  sourceTitle: string;
  /** 링크가 나타난 문맥 (앞뒤 텍스트) */
  contextSnippet: string;
  /** 링크가 나타난 라인 번호 */
  lineNumber?: number;
  /** 링크 타입 (wiki/markdown) */
  linkType: 'wiki' | 'markdown';
}

/**
 * 백링크 검색 결과
 */
export interface BacklinkResult {
  /** 타겟 노트 UID */
  targetUid: string;
  /** 백링크 목록 */
  backlinks: BacklinkContext[];
  /** 총 백링크 수 */
  totalCount: number;
}
