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
  filePath?: string;
  links?: string[];
  outgoingLinks: string[];
  incomingLinks: string[];
  tags: string[];
  score?: number;
  depth?: number;
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
