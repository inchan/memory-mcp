/**
 * @memory-mcp/index-search
 * FTS/그래프 인덱싱 & 검색
 */

export * from './types';
export * from './database';
export * from './fts-index';
export * from './link-graph';
export * from './search-engine';

// Re-export common types for convenience
export type { LinkGraphNode } from '@memory-mcp/common';

export const PACKAGE_VERSION = '0.1.0';
