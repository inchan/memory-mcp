# Memory MCP

> **v0.1.0-alpha** - Local-first persistent memory MCP server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

로컬 퍼시스턴트 메모리를 **MCP 서버**로 노출하여, Claude 등 MCP 호환 AI 에이전트가 당신의 지식 베이스를 활용할 수 있게 합니다.

## ✨ Features

- 📝 **Markdown + YAML Front Matter** - 표준 포맷으로 노트 저장
- 🗂️ **PARA Organization** - Projects/Areas/Resources/Archives 분류
- 🔗 **Zettelkasten Linking** - UID 기반 노트 연결 및 백링크
- 🔍 **SQLite FTS5 Search** - 빠른 전문 검색 (v0.2.0)
- 🏠 **Local-first** - 모든 데이터를 로컬에 안전하게 보관
- 🔐 **Privacy** - 네트워크 송출 없음, 원자적 쓰기

## 🚀 Quick Start

### Installation

```bash
npm install -g @memory-mcp/mcp-server
```

Or use with `npx`:

```bash
npx @memory-mcp/mcp-server --vault ~/my-vault
```

### Claude Desktop Setup

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "@memory-mcp/mcp-server",
        "--vault",
        "/Users/yourname/Documents/memory-vault"
      ]
    }
  }
}
```

### Create a Test Note

```bash
# Create vault directory
mkdir -p ~/my-vault

# Create a sample note
cat > ~/my-vault/my-first-note-20250101T120000Z.md << 'EOF'
---
id: "20250101T120000Z"
title: "My First Note"
category: "Resources"
tags: ["getting-started"]
created: "2025-01-01T12:00:00Z"
updated: "2025-01-01T12:00:00Z"
links: []
---

# My First Note

This is my first note in Memory MCP!

## What I can do

- Store knowledge in Markdown
- Link notes together
- Search through my notes
- Let Claude access my knowledge base
EOF
```

## 📚 Available Tools (v0.1.0-alpha)

Memory MCP provides the following MCP tools:

### `create_note`
Create a new Markdown note with Front Matter.

**Input**:
```json
{
  "title": "My Note",
  "content": "Note content...",
  "category": "Resources",
  "tags": ["tag1", "tag2"],
  "project": "optional-project-name"
}
```

**Output**: Note ID (UID), file path, and metadata

---

### `read_note`
Read a note by its unique ID.

**Input**:
```json
{
  "uid": "20250101T120000Z",
  "includeMetadata": false,
  "includeLinks": false
}
```

**Options**:
- `includeMetadata`: Add file size, word count, character count
- `includeLinks`: Add backlink analysis and broken link detection

**Output**: Full note content with metadata

---

### `list_notes`
List notes with filtering, sorting, and pagination.

**Input**:
```json
{
  "category": "Projects",
  "tags": ["important"],
  "project": "my-project",
  "limit": 100,
  "offset": 0,
  "sortBy": "updated",
  "sortOrder": "desc"
}
```

**Filters** (all optional):
- `category`: Filter by PARA category (Projects/Areas/Resources/Archives)
- `tags`: Filter by tags (OR logic - matches any tag)
- `project`: Filter by project name

**Sorting**:
- `sortBy`: `created`, `updated`, or `title`
- `sortOrder`: `asc` or `desc`

**Pagination**:
- `limit`: Max results (default 100, max 1000)
- `offset`: Skip first N results

**Output**: List of notes with metadata, total count, and pagination info

---

### `search_memory` *(coming in v0.2.0)*
Full-text search with FTS5 integration.

Currently returns a placeholder message. Use `list_notes` with filters for now.

---

## 🗂️ Note Structure

Each note follows this structure:

```markdown
---
id: "20250101T120000000000Z"  # Auto-generated UID (timestamp-based)
title: "Note Title"
category: "Resources"          # PARA: Projects|Areas|Resources|Archives
tags: ["tag1", "tag2"]        # Optional tags
project: "project-name"       # Optional project association
created: "2025-01-01T12:00:00Z"
updated: "2025-01-01T12:00:00Z"
links: ["other-note-uid"]     # Links to other notes
---

# Note Title

Your note content in Markdown...

## You can use

- Lists
- **Bold** and *italic*
- [Links](https://example.com)
- [[other-note-uid]] (Zettelkasten-style links)
```

**File naming**: `{sanitized-title}-{uid}.md`
- Example: `my-project-notes-20250101T120000Z.md`

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm 8+

### Setup

```bash
# Clone the repository
git clone https://github.com/inchan/memory-mcp.git
cd memory-mcp

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

### Project Structure

```
memory-mcp/
├── packages/
│   ├── mcp-server/      # MCP server & CLI
│   ├── storage-md/      # Markdown storage & Front Matter
│   ├── index-search/    # FTS5 search & link graph
│   ├── assoc-engine/    # Context-aware ranking (future)
│   └── common/          # Shared utilities & types
└── docs/                # Documentation & specs
```

### Running Locally

```bash
# Start server with test vault
node packages/mcp-server/dist/cli.js --vault /tmp/test-vault

# Or with npm
npm start -- --vault /tmp/test-vault

# Run healthcheck
node packages/mcp-server/dist/cli.js healthcheck --vault /tmp/test-vault
```

## 📖 Documentation

- [`docs/MVP_ROADMAP_3MONTHS.md`](docs/MVP_ROADMAP_3MONTHS.md) - 3-month development roadmap
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - Epic/feature tree structure
- [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md) - Technical stack & KPIs
- [`docs/GOALS.md`](docs/GOALS.md) - Project goals & milestones
- [`DEVELOPMENT_GUIDELINES.md`](DEVELOPMENT_GUIDELINES.md) - Development principles (SOLID, TDD, SDD)

## 🗺️ Roadmap

### v0.1.0-alpha (Current) ✅
- [x] Basic CRUD operations (create/read/list)
- [x] Markdown + Front Matter storage
- [x] PARA categorization
- [x] Link analysis & backlinks
- [x] CLI interface
- [x] MCP server integration

### v0.2.0 (Next)
- [ ] `update_note` and `delete_note` tools
- [ ] FTS5 full-text search integration
- [ ] Comprehensive unit tests (50% coverage)
- [ ] Performance benchmarks
- [ ] Zettelkasten link auto-suggestions

### v1.0.0 (Future)
- [ ] Vector embedding search
- [ ] Olima context-aware ranking engine
- [ ] Advanced link graph queries
- [ ] Docker image
- [ ] Production-ready CI/CD

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Follow [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md)
2. Write tests for new features
3. Ensure `npm run build` succeeds
4. Use Conventional Commits for commit messages
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - For the standardized protocol
- [Zettelkasten](https://zettelkasten.de/) - For the note-taking methodology
- [PARA Method](https://fortelabs.com/blog/para/) - For the organizational framework

## 📞 Support

- 🐛 [Report a bug](https://github.com/inchan/memory-mcp/issues)
- 💡 [Request a feature](https://github.com/inchan/memory-mcp/issues)
- 💬 [Discussions](https://github.com/inchan/memory-mcp/discussions)

---

**Status**: 🚧 Alpha - Under active development

**Note**: This is an alpha release. APIs may change. Feedback and contributions are greatly appreciated!
