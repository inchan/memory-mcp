import type {
  BacklinkOptions,
  ConnectedNotesOptions,
  EnhancedSearchResult,
  LinkGraphNode,
  LinkRelation,
  SearchOptions,
} from "@memory-mcp/index-search";

export interface SearchEngineAdapter {
  search(query: string, options?: SearchOptions): Promise<EnhancedSearchResult>;
  getBacklinks(noteUid: string, options?: BacklinkOptions): LinkRelation[];
  getOutgoingLinks(noteUid: string, options?: BacklinkOptions): LinkRelation[];
  getConnectedNodes?(noteUid: string, options?: ConnectedNotesOptions): LinkGraphNode[];
}

export interface AssociationEngineConfig {
  defaultLimit?: number;
  maxCandidates?: number;
  timeoutMs?: number;
  scoring?: {
    baseWeight?: number;
    linkWeight?: number;
    tagWeight?: number;
    contextWeight?: number;
  };
}

export interface AssociationContextNote {
  id: string;
  weight?: number;
  tags?: string[];
  title?: string;
  category?: string;
  filePath?: string;
  snippet?: string;
  reasons?: string[];
}

export interface AssociationRequest {
  sessionId: string;
  query: string;
  limit?: number;
  tags?: string[];
  contextNotes?: AssociationContextNote[];
}

export interface AssociationRecommendation {
  id: string;
  title: string;
  score: number;
  category: string;
  filePath: string;
  snippet: string;
  tags: string[];
  links: string[];
  reasons: string[];
}

export interface AssociationResult {
  sessionId: string;
  recommendations: AssociationRecommendation[];
  totalCandidates: number;
  metrics: {
    tookMs: number;
    maxScore: number;
  };
}

export interface SessionFocusNote {
  id: string;
  weight: number;
  tags: string[];
  lastUpdated: number;
  title?: string;
  category?: string;
  filePath?: string;
  snippet?: string;
  reasons?: string[];
}

export interface SessionQueryEntry {
  query: string;
  timestamp: string;
}

export interface SessionContext {
  sessionId: string;
  updatedAt: number;
  focusNotes: SessionFocusNote[];
  tags: string[];
  queries: SessionQueryEntry[];
}

export interface SessionContextSnapshot {
  sessionId: string;
  updatedAt: string;
  focusNotes: SessionFocusNote[];
  tags: string[];
  queries: SessionQueryEntry[];
}

export interface SessionContextManagerConfig {
  maxHistory?: number;
  sessionTtlMs?: number;
}

export interface SessionContextUpdate {
  focusNotes?: AssociationContextNote[];
  tags?: string[];
  query?: string;
}

export interface ReflectionNote {
  id: string;
  title: string;
  summary?: string;
  highlights?: string[];
  tags?: string[];
}

export interface ReflectionRequest {
  sessionId: string;
  notes: ReflectionNote[];
  queries: SessionQueryEntry[];
}

export interface ReflectionResult {
  sessionId: string;
  summary: string;
  keyInsights: string[];
  highlightIndex: Record<string, string[]>;
  tags: string[];
}

export interface ReflectionEngineConfig {
  maxHighlights?: number;
}
