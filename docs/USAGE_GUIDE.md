# Zettel Memory 사용 가이드

Zettel Memory는 로컬 Markdown 기반 지식 베이스를 MCP(Model Context Protocol)를 통해 Claude와 연동하는 서버입니다.

## 빠른 시작

### 1. Claude Desktop 설정

#### Step 1: Claude Desktop 설치
[Claude Desktop](https://claude.ai/download) 다운로드 및 설치

#### Step 2: MCP 설정 파일 편집

**macOS/Linux:**
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

#### Step 3: Zettel Memory 서버 추가

```json
{
  "mcpServers": {
    "zettel-memory": {
      "command": "node",
      "args": [
        "/path/to/zettel-memory/packages/mcp-server/dist/cli.js",
        "--vault",
        "/Users/yourname/Documents/vault",
        "--index",
        "/Users/yourname/.zettel-memory/index.db"
      ]
    }
  }
}
```

**주의사항:**
- `--vault`: Markdown 노트를 저장할 디렉토리 (존재하지 않으면 자동 생성)
- `--index`: SQLite FTS5 인덱스 파일 경로
- 절대 경로 사용 필수
- ✅ **루트 레벨 옵션 사용** - `server` 서브커맨드 불필요 (v0.1.1+)

#### Step 4: Claude Desktop 재시작

Claude Desktop을 완전히 종료하고 다시 시작합니다.

#### Step 5: 연결 확인

Claude Desktop 좌측 하단에 🔌 아이콘이 표시되면 연결 성공!

### 2. CLI로 직접 실행

#### 서버 시작 (권장 방식)

**직접 실행 (루트 레벨 옵션):**
```bash
# ✅ Claude Desktop 호환 (권장)
node packages/mcp-server/dist/cli.js --vault ~/Documents/vault --index ~/.zettel-memory/index.db

# 또는 npm 사용
npm start -- --vault ~/Documents/vault --index ~/.zettel-memory/index.db
```

**서브커맨드 방식 (하위 호환):**
```bash
# ⚠️ 하위 호환성을 위해 지원되지만 권장하지 않음
node packages/mcp-server/dist/cli.js server --vault ~/Documents/vault --index ~/.zettel-memory/index.db
```

#### 헬스체크
```bash
node packages/mcp-server/dist/cli.js healthcheck \
  --vault ~/Documents/vault \
  --index ~/.zettel-memory/index.db
```

#### 사용 가능한 옵션
```bash
--vault <path>      # 볼트 디렉토리 경로 (기본: ./vault)
--index <path>      # 인덱스 데이터베이스 경로 (기본: ./.memory-index.db)
--mode <mode>       # 동작 모드: dev | prod (기본: dev)
--timeout <ms>      # 툴 실행 타임아웃 (기본: 5000ms)
--retries <count>   # 툴 실행 재시도 횟수 (기본: 2)
--verbose           # 상세 로그 출력
```

## 사용 예시

### 1. 노트 생성

Claude Desktop에서:
```
"Zettelkasten 방법론"이라는 제목으로 노트를 만들어줘.
카테고리는 Resources, 태그는 knowledge-management, productivity로.

내용:
# Zettelkasten 방법론

효과적인 지식 관리 시스템입니다.

## 핵심 원칙
1. 원자성
2. 연결성
3. 자율성
```

→ Zettel Memory의 `create_note` 도구가 자동 호출됩니다.

### 2. 노트 검색

```
"productivity"와 관련된 노트를 찾아줘
```

→ `search_memory` 도구로 FTS5 전문 검색 실행

### 3. 노트 목록 조회

```
Resources 카테고리의 모든 노트를 보여줘
```

→ `list_notes` 도구로 필터링된 목록 조회

### 4. 노트 읽기

```
UID가 20251113T124827280002Z인 노트 내용을 보여줘
```

→ `read_note` 도구로 노트 읽기

### 5. 노트 수정

```
이 노트에 "updated" 태그를 추가하고 프로젝트를 "knowledge-base"로 설정해줘
```

→ `update_note` 도구로 부분 업데이트

### 6. 노트 삭제

```
UID 20251113T124827280002Z 노트를 삭제해줘
```

→ `delete_note` 도구로 안전한 삭제 (confirm 필수)

## 6가지 MCP Tools

### `create_note`
새 노트 생성

**Parameters:**
- `title` (required): 노트 제목
- `content` (required): Markdown 콘텐츠
- `category` (optional): PARA 카테고리 (Projects/Areas/Resources/Archives)
- `tags` (optional): 태그 배열
- `project` (optional): 프로젝트 이름
- `links` (optional): 연결된 노트 UID 배열

**Returns:**
- 생성된 노트의 UID
- 파일 경로
- Front Matter

### `read_note`
노트 읽기

**Parameters:**
- `uid` (required): 노트 UID
- `includeMetadata` (optional): 메타데이터 포함 여부
- `includeLinks` (optional): 링크 정보 포함 여부

**Returns:**
- 노트 제목
- 콘텐츠
- Front Matter
- 파일 경로

### `list_notes`
노트 목록 조회

**Parameters:**
- `category` (optional): PARA 카테고리 필터
- `tags` (optional): 태그 필터
- `project` (optional): 프로젝트 필터
- `limit` (optional): 결과 수 제한 (기본: 100)
- `offset` (optional): 페이징 오프셋
- `sortBy` (optional): 정렬 기준 (created/updated/title)
- `sortOrder` (optional): 정렬 순서 (asc/desc)

**Returns:**
- 노트 목록 (UID, 제목, 카테고리, 태그)
- 총 개수

### `search_memory`
FTS5 전문 검색

**Parameters:**
- `query` (required): 검색 쿼리
- `limit` (optional): 결과 수 제한 (기본: 10)
- `category` (optional): 카테고리 필터
- `tags` (optional): 태그 필터

**Returns:**
- 검색 결과 (UID, 제목, 점수)
- BM25 ranking 점수
- 하이라이트된 스니펫
- 검색 시간 (ms)

**Features:**
- SQLite FTS5 엔진
- BM25 relevance ranking
- 제목/콘텐츠 하이라이팅
- 카테고리/태그 필터링
- <1ms 검색 성능

### `update_note`
노트 수정

**Parameters:**
- `uid` (required): 노트 UID
- `title` (optional): 새 제목
- `content` (optional): 새 콘텐츠
- `category` (optional): 새 카테고리
- `tags` (optional): 새 태그 배열
- `project` (optional): 새 프로젝트
- `links` (optional): 새 링크 배열

**Returns:**
- 업데이트된 노트 정보
- `updated` 타임스탬프 자동 갱신

**Features:**
- 부분 업데이트 지원 (원하는 필드만 전달)
- 타임스탬프 자동 관리
- FTS5 인덱스 자동 동기화

### `delete_note`
노트 삭제

**Parameters:**
- `uid` (required): 노트 UID
- `confirm` (required): 삭제 확인 (true 필수)

**Returns:**
- 삭제 완료 메시지

**Safety:**
- `confirm: true` 필수 (실수 방지)
- ⚠️ **복구 불가능**
- FTS5 인덱스에서도 자동 제거

## Front Matter 스키마

모든 노트는 YAML Front Matter를 포함합니다:

```yaml
---
id: "20251113T124827280002Z"    # 자동 생성 UID
title: "노트 제목"
category: "Resources"            # PARA: Projects/Areas/Resources/Archives
tags:                            # 태그 배열
  - tag1
  - tag2
project: "project-name"          # 선택적 프로젝트 연결
created: "2025-11-13T12:48:27.280Z"
updated: "2025-11-13T12:48:27.298Z"
links:                           # 연결된 노트 UID들
  - "other-note-uid"
---

# 노트 콘텐츠

Markdown 형식으로 작성...
```

## 파일 구조

```
~/Documents/vault/
├── zettelkasten-방법론-20251113T124827280002Z.md
├── para-방법론-20251113T124827295003Z.md
└── memory-mcp-프로젝트-20251113T124827297005Z.md

~/.zettel-memory/
└── index.db    # SQLite FTS5 인덱스
```

## 트러블슈팅

### Claude Desktop이 MCP 서버를 인식하지 못해요

1. **설정 파일 경로 확인**
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **경로가 절대 경로인지 확인**
   - ❌ `./packages/mcp-server/dist/cli.js`
   - ✅ `/path/to/zettel-memory/packages/mcp-server/dist/cli.js`

3. **빌드가 완료되었는지 확인**
   ```bash
   cd /path/to/zettel-memory
   npm run build
   ls packages/mcp-server/dist/cli.js
   ```

4. **Claude Desktop 재시작**
   - 완전히 종료 후 다시 시작

### 검색이 작동하지 않아요

1. **인덱스 경로 확인**
   ```bash
   ls -la ~/.zettel-memory/index.db
   ```

2. **노트가 인덱싱되었는지 확인**
   - 노트 생성/수정 시 자동으로 인덱싱됩니다
   - 기존 노트는 수동으로 인덱싱 필요

3. **인덱스 재빌드** (향후 구현 예정)

### 노트가 생성되지 않아요

1. **Vault 디렉토리 권한 확인**
   ```bash
   ls -ld ~/Documents/vault
   # drwxr-xr-x로 시작해야 함
   ```

2. **디렉토리 생성**
   ```bash
   mkdir -p ~/Documents/vault
   ```

## 성능

- **검색 속도**: < 1ms (1만 노트 기준)
- **인덱싱**: 실시간 (노트 생성/수정 시 자동)
- **메모리**: ~ 50MB (1만 노트 기준)
- **디스크**: ~ 100MB (1만 노트 + 인덱스)

## 데이터 안전성

- ✅ 로컬 우선: 모든 데이터는 로컬에 저장
- ✅ 파일 기반: 표준 Markdown 파일 (다른 도구와 호환)
- ✅ 원자적 쓰기: 데이터 손실 방지
- ✅ 백업 가능: 일반 파일이므로 Git, Dropbox 등 사용 가능

## 다음 단계

- 📖 [기술 사양서](./TECHNICAL_SPEC.md)
- 🗺️ [로드맵](./ROADMAP.md)
- 🏗️ [아키텍처](./ARCHITECTURE.md)
- 🎯 [프로젝트 목표](./GOALS.md)
- ✅ [검증 전략](./VALIDATION_STRATEGY.md)

## 지원

- GitHub Issues: https://github.com/inchan/zettel-memory/issues
- 문서: `/docs`
