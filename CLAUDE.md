# CLAUDE.md

> **Note**: The main CLAUDE.md file is located at [.claude/CLAUDE.md](./.claude/CLAUDE.md)
> This file provides guidance to Claude Code when working with this repository.

---

## Quick Reference

**Memory MCP (Olima + Basic-Memory + Zettelkasten + PARA)** - A TypeScript/Node.js based knowledge management system that exposes local persistent memory as an MCP server.

### Quick Start

```bash
# Build all packages
npm run build

# Run tests
npm test

# Run MCP server
npm start
# or
npx memory-mcp --vault ~/vault --index ~/.memory-index.db
```

### Technology Stack
- **Runtime**: Node.js 18+ / TypeScript 5+
- **Storage**: Markdown + YAML Front Matter
- **Search**: SQLite FTS5 + link graph
- **Organization**: PARA + Zettelkasten

### Documentation
- **[.claude/CLAUDE.md](./.claude/CLAUDE.md)** - Complete project guidance
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture
- **[docs/ROADMAP.md](./docs/ROADMAP.md)** - Feature roadmap
- **[docs/GOALS.md](./docs/GOALS.md)** - Project goals and KPIs

---

For complete documentation, see [.claude/CLAUDE.md](./.claude/CLAUDE.md).
