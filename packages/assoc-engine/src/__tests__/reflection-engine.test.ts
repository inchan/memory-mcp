import { ReflectionEngine } from "../reflection-engine.js";

const sampleNotes = [
  {
    id: "note-1",
    title: "Graph Search Strategies",
    summary: "Discusses graph traversal and scoring.",
    highlights: ["Use weighted BFS", "Normalize scores"],
    tags: ["graph", "search"],
  },
  {
    id: "note-2",
    title: "Link Analysis Heuristics",
    summary: "Combine link metrics with BM25.",
    highlights: ["Link overlap boosts", "Normalize scores"],
    tags: ["graph", "ranking"],
  },
];

describe("ReflectionEngine", () => {
  it("summarises session notes and deduplicates highlights", () => {
    const engine = new ReflectionEngine({ maxHighlights: 5 });

    const reflection = engine.buildReflection({
      sessionId: "session-1",
      notes: sampleNotes,
      queries: [
        { query: "graph search", timestamp: new Date().toISOString() },
        { query: "link analysis", timestamp: new Date().toISOString() },
      ],
    });

    expect(reflection.keyInsights.length).toBeGreaterThanOrEqual(3);
    expect(reflection.summary).toContain("graph search");
    expect(reflection.highlightIndex["Normalize scores"]).toHaveLength(2);
  });
});
