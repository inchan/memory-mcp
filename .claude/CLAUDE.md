# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Memory MCP (Olima + Basic-Memory + Zettelkasten + PARA)** is a TypeScript/Node.js based knowledge management system that exposes local persistent memory as an MCP server. The goal is to build a knowledge management system that can be immediately utilized by MCP-compatible agents like Claude.

### Core Features
- **Markdown Storage**: YAML Front Matter + local file system
- **Full-Text Search**: SQLite FTS5 based search + link graph
- **PARA Organization**: Projects/Areas/Resources/Archives + Zettelkasten
- **Olima Association Engine**: Session context-based associative search and recommendations
- **MCP Interface**: Standard MCP server/CLI (`npx memory-mcp`)

### Technology Stack
- **Runtime**: Node.js 18+ / TypeScript 5+
- **Storage**: Markdown + YAML Front Matter, local file system
- **Search**: SQLite FTS5 (full-text search) + link graph
- **Organization**: PARA + Zettelkasten
- **Interface**: MCP standard server/CLI

---

## Architecture

### Package Structure
```
project/
├── packages/
│   ├── mcp-server/           # MCP interface/tool exposure
│   ├── storage-md/           # Markdown storage/Front Matter handling
│   ├── index-search/         # FTS/graph indexing & search
│   ├── assoc-engine/         # Association (Olima) engine
│   └── common/               # Schemas/utils/logging
└── docs/                     # Design/specs/roadmap
```

### Key Components
1. **MCP Server Core**: Protocol server and CLI, standard error handling/retry strategy
2. **Storage Layer**: Markdown file management, Front Matter schema, atomic writes
3. **Indexing & Search**: SQLite FTS5 based full-text search, link graph traversal
4. **Association Engine (Olima)**: Session context-based associative search and recommendations
5. **Zettelkasten Linking**: UID/backlinks/orphan note management

### Package Dependencies
```
mcp-server (CLI/Server)
├── storage-md (Markdown processing)
├── index-search (SQLite FTS5 search)
├── assoc-engine (Olima association engine)
└── common (Common schemas/types)
```

### Key Dependencies
- **better-sqlite3**: SQLite FTS5 full-text search
- **gray-matter**: Markdown Front Matter parsing
- **chokidar**: File system watching
- **commander**: CLI interface
- **zod**: Schema validation

### Front Matter Schema
```yaml
---
id: "20250927T103000Z"           # Timestamp-based UID
title: "Note Title"
category: "Resources"            # PARA: Projects/Areas/Resources/Archives
tags: ["tag1", "tag2"]          # Classification tags
project: "project-name"         # Project connection (optional)
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
links: ["other-note-id"]        # Connected notes
---
```

---

## Documentation

### ✅ [Validation Strategy](./docs/VALIDATION_STRATEGY.md) - 최우선!
**"검증을 어떻게 할 것인가?"** - 구체적인 검증 방법론:
- 검증 5단계 (타입/단위/통합/E2E/성능보안)
- 자동화된 검증 파이프라인
- 검증 체크리스트
- 실전 예제

### 📋 [Development Guidelines](./docs/DEVELOPMENT_GUIDELINES.md)
Coding principles and best practices:
- Validation First (최우선 원칙)
- SOLID, DRY, KISS, YAGNI principles
- Test-Driven Development (TDD)
- SDD + TDD Integration workflow

### 🏗️ [Architecture](./docs/ARCHITECTURE.md)
System architecture and data model:
- Package structure and responsibilities
- Sequence diagrams
- Data model and Front Matter schema

### 🎯 [Goals](./docs/GOALS.md)
Project goals and milestones:
- Main objectives
- KPIs and success metrics

### 🗺️ [Roadmap](./docs/ROADMAP.md)
Epic/feature/spec tree structure:
- Feature roadmap
- Implementation priorities

### 🔧 [Technical Specification](./docs/TECHNICAL_SPEC.md)
Technical stack and requirements:
- Security requirements
- Performance KPIs
- Observability

### 📐 [Specifications](./docs/specs/)
Epic-based detailed specifications:
- E1: MCP Server Core (Protocol/CLI, Config, Error Handling)
- E2: Storage (Markdown/PARA, File Schema, Watcher, Security)
- E3: Indexing & Search (FTS, Link Graph, Query DSL)
- E4: Association Engine (Olima, Session Context, Reflection)
- E5: Zettelkasten Linking (Link Parser, Backlinks, Orphan Notes)
- E6: Deployment/Packaging (npm/npx, Docker, CI/CD)

---

## Development Workflow

### Commands
This project uses npm workspaces in a monorepo structure. Build/test all packages from root:

```bash
# Build all packages
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Lint & type check
npm run lint
npm run lint:fix
npm run typecheck

# Clean
npm run clean

# Run MCP server
npm start
# or
npx memory-mcp --vault ~/vault --index ~/.memory-index.db
```

### Working with Individual Packages
To work with a specific package:

```bash
# Navigate to specific package
cd packages/mcp-server

# Run package-specific commands
npm run build
npm run dev
npm test

# Or from root, target specific package
npm run build --workspace=@memory-mcp/mcp-server
```

### Code Conventions
- Variables/functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

---

## Quality Standards

### Performance KPIs
- Search P95 latency < 120ms (10k notes, local)
- Incremental indexing < 3 seconds
- Full index rebuild (10k files) < 5 minutes
- Initial boot to index ready < 8 seconds

### Security Requirements
- Local-first, network transmission disabled by default
- Sensitive information regex masking (>95% precision)
- Atomic file writes with fsync guarantee
- Zero data loss

### Testing
- Test coverage 80%+
- Unit/integration/load testing

---

## Project Philosophy

### 🎯 Validation First (최우선 원칙)
**"검증을 어떻게 할 것인가?"를 먼저 생각하고, 코드는 나중에 작성합니다.**

- **Define Validation Method First**: Before writing code, define how to validate it
- **No Validation, No Code**: No implementation without validation strategy
- **Automated Testing**: All validation must be automated (CI/CD)
- **Never Skip**: Validation failures must be fixed immediately

📖 See [VALIDATION_STRATEGY.md](./docs/VALIDATION_STRATEGY.md) for detailed methodology

---

### Other Core Principles

- **Test-Driven Development**: Write tests first, implement second
- **Simplicity First**: Keep it simple, add complexity only when needed
- **Clear Documentation**: All significant decisions and structures are documented
- **Local-First**: Privacy and data ownership are paramount
- **Modular Architecture**: Each package maintains independence

See [DEVELOPMENT_GUIDELINES.md](./docs/DEVELOPMENT_GUIDELINES.md) for complete development principles.
