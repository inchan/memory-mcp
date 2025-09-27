# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

이 프로젝트는 **Memory MCP (Olima + Basic-Memory + Zettelkasten + PARA)** 시스템으로, 로컬 퍼시스턴트 메모리를 MCP 서버로 노출하는 프로젝트입니다. Claude 등 MCP 호환 에이전트에서 즉시 활용할 수 있는 지식 관리 시스템을 구축하는 것이 목표입니다.

## Architecture

### Core Technology Stack
- **Runtime**: Node.js 18+ / TypeScript 5+
- **Storage**: Markdown + YAML Front Matter, 로컬 파일 시스템
- **Search**: SQLite FTS5 (전문 검색) + 링크 그래프
- **Organization**: PARA (Projects/Areas/Resources/Archives) + Zettelkasten
- **Interface**: MCP 표준 서버/CLI (`npx memory-mcp`)

### Package Architecture
```
project/
├── packages/
│   ├── mcp-server/           # MCP 인터페이스/툴 노출
│   ├── storage-md/           # MD 저장/로드/Front Matter 처리
│   ├── index-search/         # FTS/그래프 인덱싱 & 검색
│   ├── assoc-engine/         # 연상(Olima) 엔진
│   └── common/               # 스키마/유틸/로깅
└── docs/                     # 설계/스펙/로드맵
```

### Key Components

1. **MCP Server Core**: 프로토콜 서버와 CLI 제공, 표준 에러 처리/재시도 전략
2. **Storage Layer**: Markdown 파일 관리, Front Matter 스키마, 원자적 쓰기
3. **Indexing & Search**: SQLite FTS5 기반 전문 검색, 링크 그래프 탐색
4. **Association Engine (Olima)**: 세션 문맥 기반 연상 검색과 자동 추천
5. **Zettelkasten Linking**: UID/백링크/고아노트 관리

## Data Model

### Front Matter Schema
```yaml
---
id: "20250927T103000Z"           # 타임스탬프 기반 UID
title: "노트 제목"
category: "Resources"            # PARA: Projects/Areas/Resources/Archives
tags: ["tag1", "tag2"]          # 분류 태그
project: "project-name"         # 프로젝트 연결 (선택)
created: "2025-09-27T10:30:00Z"
updated: "2025-09-27T10:30:00Z"
links: ["other-note-id"]        # 연결된 노트들
---
```

## Development Workflow

### Commands
이 프로젝트는 npm workspaces를 사용하는 모노레포 구조입니다. 루트에서 모든 패키지를 한번에 빌드/테스트할 수 있습니다:

```bash
# 모든 패키지 빌드
npm run build

# 모든 패키지 개발 모드 (watch)
npm run dev

# 테스트 실행
npm test
npm run test:watch
npm run test:coverage

# 린트 & 타입 체크
npm run lint
npm run lint:fix
npm run typecheck

# 정리
npm run clean

# MCP 서버 실행
npm start
# 또는
npx memory-mcp --vault ~/vault --index ~/.memory-index.db
```

### 개별 패키지 작업
특정 패키지에서만 작업하려면:

```bash
# 특정 패키지로 이동
cd packages/mcp-server

# 개별 패키지 명령어 실행
npm run build
npm run dev
npm test
npm run test:watch
npm run clean

# 또는 루트에서 특정 패키지 대상으로 실행
npm run build --workspace=@memory-mcp/mcp-server
```

### Code Conventions
- 변수/함수: `camelCase`
- 클래스: `PascalCase`
- 상수: `UPPER_SNAKE_CASE`
- 커밋 메시지: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

## Quality Standards

### Performance KPIs
- 검색 P95 지연시간 < 120ms (1만 노트 기준, 로컬)
- 증분 색인 < 3초
- 전체 색인 재빌드(1만 파일) < 5분
- 초기 부팅 후 인덱스 준비 < 8초

### Security Requirements
- 로컬 우선, 네트워크 송출 기본 비활성
- 민감정보 정규식 마스킹 (>95% 정탐율)
- 원자적 파일 쓰기, fsync 보장
- 데이터 손실 0

### Testing
- 테스트 커버리지 80%+
- 유닛/통합/부하 테스트

## Project Structure & Navigation

### Key Documentation
- `docs/ROADMAP.md`: 에픽/기능/스펙 트리 구조와 목표
- `docs/TECHNICAL_SPEC.md`: 기술 스택/보안/관측/KPI
- `docs/ARCHITECTURE.md`: 패키지 구성, 시퀀스 다이어그램, 데이터 모델
- `docs/GOALS.md`: 주요 목표와 마일스톤/KPI
- `docs/specs/*`: 에픽-기능별 폴더, 상세 스펙 문서들

### Epic Structure
1. **MCP서버코어**: 프로토콜CLI, 설정관리, 오류처리
2. **저장소(Markdown/PARA)**: 파일스키마, 워처동기화, 보안보강
3. **인덱싱&검색**: 텍스트인덱스FTS, 링크그래프, 쿼리DSL
4. **연상엔진(Olima)**: 연관추천, 세션컨텍스트, 리플렉션
5. **링킹(Zettelkasten)**: 링크파서, 백링크관리, 고아노트
6. **배포/패키징**: npm/npx, Docker, CI/CD

## Implementation Notes

이 프로젝트는 5개의 모듈화된 패키지로 구성된 TypeScript 기반 모노레포입니다:

### Package Dependencies
```
mcp-server (CLI/서버)
├── storage-md (Markdown 처리)
├── index-search (SQLite FTS5 검색)
├── assoc-engine (Olima 연상 엔진)
└── common (공통 스키마/타입)
```

### Key Dependencies
- **better-sqlite3**: SQLite FTS5 전문 검색
- **gray-matter**: Markdown Front Matter 파싱
- **chokidar**: 파일 시스템 감시
- **commander**: CLI 인터페이스
- **zod**: 스키마 검증

### Development Focus Areas
- 모듈화된 패키지 구조로 각 컴포넌트의 독립성 보장
- SQLite FTS5와 링크 그래프의 효율적인 통합
- MCP 표준 준수와 Claude 등 에이전트와의 호환성
- 로컬 파일 시스템 기반의 안전한 데이터 관리
- Olima 연상 엔진의 세션 문맥 활용