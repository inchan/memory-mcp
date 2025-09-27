import { SessionContextManager } from "../session-context.js";

describe("SessionContextManager", () => {
  it("merges context updates and keeps recency order", () => {
    const manager = new SessionContextManager({
      maxHistory: 5,
      sessionTtlMs: 1_000,
    });

    manager.updateContext("session-1", {
      focusNotes: [{ id: "note-1", weight: 1 }],
      tags: ["graph"],
      query: "graph search",
    });

    manager.updateContext("session-1", {
      focusNotes: [{ id: "note-2", weight: 0.5 }],
      tags: ["ranking"],
      query: "link analysis",
    });

    const context = manager.getContext("session-1");

    expect(context?.tags).toEqual(["graph", "ranking"]);
    expect(context?.focusNotes.map((note) => note.id)).toEqual(["note-2", "note-1"]);
    expect(context?.queries.map((entry) => entry.query)).toEqual([
      "link analysis",
      "graph search",
    ]);
  });

  it("prunes stale sessions", () => {
    jest.useFakeTimers();

    const manager = new SessionContextManager({
      maxHistory: 3,
      sessionTtlMs: 5,
    });

    manager.updateContext("session-1", {
      focusNotes: [{ id: "note-1", weight: 1 }],
      tags: ["graph"],
    });

    jest.advanceTimersByTime(10);

    manager.prune();

    expect(manager.getContext("session-1")).toBeUndefined();

    jest.useRealTimers();
  });
});
