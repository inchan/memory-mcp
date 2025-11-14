# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.0.1] - 2025-11-14

**Initial release** - Memory MCP Server for local-first knowledge management

### Added

#### MCP Server & CLI
- MCP server implementation with JSON-RPC 2.0 over stdio
- CLI with root-level options support (Claude Desktop compatible)
  - `--vault` - Vault directory path
  - `--index` - Index database path
  - `--mode` - Mode: dev | prod
  - `--timeout` - Tool execution timeout
  - `--retries` - Tool execution retry count
  - `--verbose` - Enable verbose logging
- Healthcheck command for vault validation
- Version command

#### Complete MCP Tools (6 tools)
- `create_note`: Create new Markdown notes with Front Matter
  - Auto-generated timestamp-based UIDs
  - PARA categorization (Projects/Areas/Resources/Archives)
  - Tag support, project association
  - Zettelkasten-style linking
- `read_note`: Read notes by UID
  - Optional metadata (file size, word count, character count)
  - Optional link analysis (backlinks, broken links)
- `list_notes`: List and filter notes
  - Filter by category, tags, project
  - Sort by created/updated/title (asc/desc)
  - Pagination support (limit/offset)
- `search_memory`: Full-text search powered by SQLite FTS5
  - FTS5 ranking algorithm with BM25 scoring
  - Category and tag filtering
  - Performance metrics (search time, result count)
  - Snippet generation with query context
- `update_note`: Update existing notes
  - Partial updates supported
  - Auto-updates `updated` timestamp
  - Syncs with search index automatically
- `delete_note`: Delete notes permanently
  - Requires explicit `confirm: true` for safety
  - Removes from search index automatically
  - ⚠️ Cannot be undone

#### Storage Layer
- Markdown + YAML Front Matter storage format
- Atomic file writes with temp → rename pattern
- File system based storage in vault directory
- UID-based note identification (ISO 8601 timestamp format)
- Automatic file naming: `{sanitized-title}-{uid}.md`
- Optional category (Zettelkasten v2 schema support)

#### Search & Indexing
- SQLite FTS5 full-text search with unicode61 tokenizer
- Link graph indexing and traversal
- Backlink detection and broken link detection
- Lazy initialization of search engine
- Performance: P95 latency < 120ms (100 notes)

#### Testing Infrastructure
- Test coverage: 24% (statements), 155 passing tests
  - `common`: 75.57% coverage
  - `mcp-server/tools`: 40.93% coverage
  - `storage-md`: 29.77% coverage
- Unit, integration, E2E, and performance tests
- MCP protocol compliance tests

#### Developer Experience
- TypeScript monorepo with npm workspaces
- 5 modular packages: mcp-server, storage-md, index-search, assoc-engine, common
- Comprehensive error handling with custom error types
- Zod schema validation for all tool inputs
- Development guidelines (SOLID, TDD, SDD)
- GitHub Actions CI/CD pipeline
- Optimized package distribution with .npmignore (23 kB package size)

#### Documentation
- Comprehensive README with quickstart guide
- Claude Desktop configuration example
- CHANGELOG, DEPLOYMENT guide
- Technical specification and architecture docs
- Development guidelines

### Technical Stack
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **Storage**: Local file system (Markdown + YAML)
- **Search**: SQLite FTS5
- **Protocol**: MCP (Model Context Protocol)
- **License**: MIT

### Known Limitations
- Test coverage below 50% target (currently 24%)
- File watcher not yet implemented (manual refresh required)
- Performance benchmarks not yet validated against KPIs
- Olima context-aware ranking engine is TODO (future)
- Vector embedding search not yet implemented (future)

### Future Roadmap
- **v0.1.0**: 50%+ test coverage, performance benchmarks, file watcher
- **v0.2.0**: Vector embeddings, Olima ranking engine, Docker image

[0.0.1]: https://github.com/inchan/memory-mcp/releases/tag/v0.0.1
