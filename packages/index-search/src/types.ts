/**
 * index-search 패키지 타입 정의
 */

import { SearchResult } from '@memory-mcp/common';

/**
 * 검색 옵션
 */
export interface SearchOptions {
  /** 검색 결과 제한 */
  limit?: number;
  /** 결과 오프셋 */
  offset?: number;
  /** 카테고리 필터 */
  category?: string;
  /** 태그 필터 */
  tags?: string[];
  /** 프로젝트 필터 */
  project?: string;
  /** 스니펫 길이 */
  snippetLength?: number;
  /** 하이라이트 마크업 */
  highlightTag?: string;
}

/**
 * 백링크 검색 옵션
 */
export interface BacklinkOptions {
  /** 결과 제한 */
  limit?: number;
  /** 컨텍스트 줄 수 */
  contextLines?: number;
}

/**
 * 연결된 노트 검색 옵션
 */
export interface ConnectedNotesOptions {
  /** 탐색 깊이 */
  depth?: number;
  /** 결과 제한 */
  limit?: number;
  /** 링크 방향 */
  direction?: 'outgoing' | 'incoming' | 'both';
}

/**
 * 인덱스 구성 옵션
 */
export interface IndexConfig {
  /** 데이터베이스 파일 경로 */
  dbPath: string;
  /** FTS 토크나이저 */
  tokenizer?: 'unicode61' | 'ascii' | 'porter';
  /** 페이지 크기 */
  pageSize?: number;
  /** 캐시 크기 (KB) */
  cacheSize?: number;
  /** WAL 모드 사용 여부 */
  walMode?: boolean;
}

/**
 * 배치 인덱싱 결과
 */
export interface BatchIndexResult {
  /** 성공한 노트 수 */
  successful: number;
  /** 실패한 노트 수 */
  failed: number;
  /** 총 처리 시간 (ms) */
  totalTimeMs: number;
  /** 실패한 노트 정보 */
  failures: Array<{
    noteUid: string;
    error: string;
  }>;
}

/**
 * 링크 관계 정보
 */
export interface LinkRelation {
  /** 소스 노트 UID */
  sourceUid: string;
  /** 타겟 노트 UID */
  targetUid: string;
  /** 링크 타입 */
  linkType: 'internal' | 'external' | 'tag';
  /** 링크 강도 (빈도 기반) */
  strength: number;
  /** 첫 생성 시간 */
  createdAt: string;
  /** 마지막 확인 시간 */
  lastSeenAt: string;
}

/**
 * 고아 노트 정보
 */
export interface OrphanNote {
  /** 노트 UID */
  uid: string;
  /** 노트 제목 */
  title: string;
  /** 파일 경로 */
  filePath: string;
  /** 생성 시간 */
  createdAt: string;
  /** 마지막 수정 시간 */
  updatedAt: string;
}

/**
 * 검색 성능 메트릭
 */
export interface SearchMetrics {
  /** 쿼리 실행 시간 (ms) */
  queryTimeMs: number;
  /** 결과 처리 시간 (ms) */
  processingTimeMs: number;
  /** 총 처리 시간 (ms) */
  totalTimeMs: number;
  /** 매칭된 총 결과 수 */
  totalResults: number;
  /** 반환된 결과 수 */
  returnedResults: number;
  /** 캐시 히트 여부 */
  cacheHit: boolean;
}

/**
 * 확장된 검색 결과 (메트릭 포함)
 */
export interface EnhancedSearchResult {
  /** 검색 결과 */
  results: SearchResult[];
  /** 성능 메트릭 */
  metrics: SearchMetrics;
  /** 총 결과 수 (페이징용) */
  totalCount: number;
}

/**
 * 인덱스 에러 타입
 */
export class IndexSearchError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'IndexSearchError';
  }
}

/**
 * 데이터베이스 에러 타입
 */
export class DatabaseError extends IndexSearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

/**
 * 검색 에러 타입
 */
export class SearchError extends IndexSearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'SEARCH_ERROR', details);
    this.name = 'SearchError';
  }
}

/**
 * 인덱싱 에러 타입
 */
export class IndexingError extends IndexSearchError {
  constructor(message: string, details?: unknown) {
    super(message, 'INDEXING_ERROR', details);
    this.name = 'IndexingError';
  }
}