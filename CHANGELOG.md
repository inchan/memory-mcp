# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.0] - 2025-01-12

### Added

#### MCP Server & CLI
- Initial MCP server implementation with JSON-RPC 2.0 over stdio
- CLI with `--vault` and `--index` options
- Healthcheck command for vault validation
- Version command

#### Core Tools (MVP)
- `create_note`: Create new Markdown notes with Front Matter
  - Auto-generated timestamp-based UIDs
  - PARA categorization (Projects/Areas/Resources/Archives)
  - Tag support
  - Project association
  - Zettelkasten-style linking
- `read_note`: Read notes by UID
  - Optional metadata (file size, word count, character count)
  - Optional link analysis (backlinks, broken links)
- `list_notes`: List and filter notes
  - Filter by category, tags, project
  - Sort by created/updated/title (asc/desc)
  - Pagination support (limit/offset)
- `search_memory`: Placeholder for FTS5 search (coming in v0.2.0)

#### Storage Layer
- Markdown + YAML Front Matter storage format
- Atomic file writes with temp → rename pattern
- File system based storage in vault directory
- UID-based note identification (ISO 8601 timestamp format)
- Automatic file naming: `{sanitized-title}-{uid}.md`

#### Note Features
- PARA organizational method support
- Zettelkasten UID linking
- Backlink detection
- Broken link detection
- Tag-based categorization
- Project association

#### Developer Experience
- TypeScript monorepo with npm workspaces
- 5 modular packages: mcp-server, storage-md, index-search, assoc-engine, common
- Comprehensive error handling with custom error types
- Zod schema validation for all tool inputs
- Development guidelines (SOLID, TDD/SDD)
- GitHub Actions CI/CD pipeline

#### Documentation
- Comprehensive README with quickstart guide
- Claude Desktop configuration example
- 3-month MVP roadmap
- Technical specification document
- Development guidelines
- Architecture documentation

### Technical Details
- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **Storage**: Local file system (Markdown)
- **Search**: SQLite FTS5 (coming in v0.2.0)
- **Protocol**: MCP (Model Context Protocol)
- **License**: MIT

### Known Limitations
- `update_note` and `delete_note` not yet implemented (planned for v0.2.0)
- Full-text search returns placeholder (FTS5 integration planned for v0.2.0)
- No test coverage yet (50% target for v0.2.0)
- Alpha release - APIs may change

### Future Roadmap
- **v0.2.0**: update/delete tools, FTS5 search, 50% test coverage, performance benchmarks
- **v1.0.0**: Vector embeddings, Olima context-aware ranking, Docker image, production CI/CD

[0.1.0-alpha.0]: https://github.com/inchan/memory-mcp/releases/tag/v0.1.0-alpha.0
