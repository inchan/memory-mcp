import {
  SessionContext,
  SessionContextManagerConfig,
  SessionContextSnapshot,
  SessionContextUpdate,
  SessionFocusNote,
} from "./types.js";

function uniqueOrdered<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function normalizeTags(tags: string[] = []): string[] {
  return uniqueOrdered(tags.map((tag) => tag.trim()).filter(Boolean));
}

const DEFAULT_CONFIG: Required<SessionContextManagerConfig> = {
  maxHistory: 10,
  sessionTtlMs: 1000 * 60 * 30,
};

function createEmptyContext(sessionId: string): SessionContext {
  return {
    sessionId,
    updatedAt: Date.now(),
    focusNotes: [],
    tags: [],
    queries: [],
  };
}

export class SessionContextManager {
  private readonly config: Required<SessionContextManagerConfig>;
  private readonly contexts = new Map<string, SessionContext>();

  constructor(config: SessionContextManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateContext(sessionId: string, update: SessionContextUpdate): SessionContextSnapshot {
    const context = this.contexts.get(sessionId) ?? createEmptyContext(sessionId);
    const now = Date.now();

    if (update.focusNotes && update.focusNotes.length > 0) {
      const existing = new Map<string, SessionFocusNote>();
      for (const note of context.focusNotes) {
        existing.set(note.id, note);
      }

      const updatedNotes: SessionFocusNote[] = [];
      for (const note of update.focusNotes) {
        const previous = existing.get(note.id);
        const weight =
          typeof note.weight === "number" ? note.weight : previous?.weight ?? 1;
        const tags = normalizeTags([...(previous?.tags ?? []), ...(note.tags ?? [])]);
        updatedNotes.push({
          id: note.id,
          weight,
          tags,
          lastUpdated: now,
          title: note.title ?? previous?.title,
          category: note.category ?? previous?.category,
          filePath: note.filePath ?? previous?.filePath,
          snippet: note.snippet ?? previous?.snippet,
          reasons: note.reasons ?? previous?.reasons,
        });
        existing.delete(note.id);
      }

      const remaining = Array.from(existing.values())
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, this.config.maxHistory - updatedNotes.length);

      context.focusNotes = [...updatedNotes, ...remaining].slice(0, this.config.maxHistory);
    }

    if (update.tags && update.tags.length > 0) {
      context.tags = normalizeTags([...context.tags, ...update.tags]);
    }

    if (update.query) {
      context.queries = [
        { query: update.query, timestamp: new Date(now).toISOString() },
        ...context.queries,
      ].slice(0, this.config.maxHistory);
    }

    context.updatedAt = now;
    this.contexts.set(sessionId, context);
    this.prune();

    return this.toSnapshot(context);
  }

  getContext(sessionId: string): SessionContextSnapshot | undefined {
    const context = this.contexts.get(sessionId);
    if (!context) {
      return undefined;
    }
    if (Date.now() - context.updatedAt > this.config.sessionTtlMs) {
      this.contexts.delete(sessionId);
      return undefined;
    }
    return this.toSnapshot(context);
  }

  reset(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  clear(): void {
    this.contexts.clear();
  }

  prune(): void {
    const now = Date.now();
    for (const [sessionId, context] of this.contexts.entries()) {
      if (now - context.updatedAt > this.config.sessionTtlMs) {
        this.contexts.delete(sessionId);
      }
    }
  }

  listActiveSessions(): SessionContextSnapshot[] {
    return Array.from(this.contexts.values())
      .filter((context) => Date.now() - context.updatedAt <= this.config.sessionTtlMs)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((context) => this.toSnapshot(context));
  }

  getPrioritizedNotes(sessionId: string): SessionFocusNote[] {
    const context = this.contexts.get(sessionId);
    if (!context) {
      return [];
    }
    return [...context.focusNotes].sort((a, b) => {
      if (a.weight === b.weight) {
        return b.lastUpdated - a.lastUpdated;
      }
      return b.weight - a.weight;
    });
  }

  private toSnapshot(context: SessionContext): SessionContextSnapshot {
    return {
      sessionId: context.sessionId,
      updatedAt: new Date(context.updatedAt).toISOString(),
      focusNotes: [...context.focusNotes],
      tags: [...context.tags],
      queries: [...context.queries],
    };
  }
}
