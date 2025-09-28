# Memory MCP (Olima + Basic-Memory + Zettelkasten + PARA)

> **🎉 주요 기능 구현 완료!** Claude 등 MCP 호환 에이전트에서 즉시 사용 가능한 로컬 지식 관리 시스템

로컬 퍼시스턴트 메모리를 **MCP 서버**로 노출하여, Claude 등 MCP 호환 에이전트에서 즉시 활용할 수 있는 완전한 지식 관리 시스템입니다.

## ✨ 핵심 기능 (구현 완료)

### 🗃️ **지능형 저장**
- **Markdown + YAML Front Matter**: 표준 포맷으로 이식성 보장
- **원자적 쓰기**: 데이터 손실 방지 (임시 파일 + rename)
- **실시간 감시**: chokidar 기반 파일 변경 자동 감지

### 📂 **PARA 구조 관리**
- **자동 분류**: Projects/Areas/Resources/Archives 구조
- **스마트 이동**: 프로젝트 상태에 따른 자동 카테고리 이동
- **아카이브**: 오래된 노트 자동 아카이브 (90일 기준)

### 🔗 **Zettelkasten 연결**
- **UID 기반**: 타임스탬프 기반 고유 식별자
- **자동 백링크**: 파일 변경 시 실시간 백링크 동기화
- **링크 무결성**: 깨진 링크 탐지 및 고아 노트 찾기

### 🔍 **하이브리드 검색**
- **SQLite FTS5**: BM25 점수 기반 전문 검색
- **링크 그래프**: 노트 간 연결 관계 기반 추천
- **점수 결합**: FTS(70%) + 링크 점수(30%) 가중 평균
- **필터링**: 카테고리, 태그, 프로젝트별 검색

### 🧠 **연상 엔진 (Olima)**
- 🔄 기본 구조 구현, 고급 기능 개발 중
- 🏠 **로컬 설치본 사용**: 외부 API 호출 없이 `@memory-mcp/assoc-engine` 패키지에 포함된 Olima 런타임으로 동작합니다.

## 🚀 즉시 사용하기

### 설치 및 실행
```bash
# NPM 패키지로 설치
npm install -g @memory-mcp/mcp-server

# 또는 npx로 바로 실행
npx memory-mcp --vault ~/my-vault --index ~/.memory-index.db

# 옵션
# --vault: 마크다운 파일이 저장될 디렉토리
# --index: SQLite 검색 인덱스 파일 위치
# --log-level: debug, info, warn, error
```

### Olima 로컬 환경 준비
- 연상 엔진은 `@memory-mcp/assoc-engine` 패키지에 번들된 **로컬 Olima 런타임**을 사용합니다.
- 신규 환경에서 실행하기 전에 `npm install && npm run build`로 로컬 런타임을 컴파일해 주세요.
- 네트워크가 차단된 환경에서도 동작하며, 외부 LLM API에 의존하지 않습니다.

### Docker 실행
```bash
docker build -t memory-mcp .
docker run --rm \
  -v "$HOME/my-vault:/vault" \
  memory-mcp --vault /vault --index /vault/.memory-index.db
```

### Claude Desktop 연동
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["memory-mcp", "--vault", "~/my-vault", "--index", "~/.memory-index.db"]
    }
  }
}
```

### 사용 가능한 MCP 툴
- **`search_memory`**: 하이브리드 검색 (키워드, 카테고리, 태그 필터)
- **`create_note`**: 노트 생성 + 자동 인덱싱 + 백링크 업데이트
- **`associate_memory`**: 세션 문맥 기반 연관 추천 + 링크/태그 가중치 결합
- **`session_context`**: 세션 포커스 노트/태그 상태 조회 및 갱신
- **`reflect_session`**: 최근 활동 요약과 중복/충돌 정리 리포트

### 사용 예시 (Claude에서)
```
"내 프로젝트에서 authentication 관련 노트를 찾아줘"
→ search_memory 툴로 검색 후 관련 노트들 반환

"새로운 API 설계 노트를 만들어줘"
→ create_note 툴로 노트 생성 후 자동 인덱싱
```

## 🏗️ 아키텍처

### 패키지 구조 (모노레포)
```
packages/
├── mcp-server/           ✅ MCP 프로토콜 서버 + CLI
├── storage-md/           ✅ 파일 관리 + 백링크 + PARA 구조
├── index-search/         ✅ FTS + 링크 그래프 하이브리드 검색
├── assoc-engine/         ✅ Olima 연상 엔진 (추천/세션/리플렉션)
└── common/               ✅ 공통 타입 + 유틸리티

docs/
├── ARCHITECTURE.md       📚 시스템 설계 및 데이터 플로우
├── ROADMAP.md           📊 개발 진행 상황 (90% 완료)
└── specs/               📋 상세 스펙 및 작업 관리
```

### 데이터 플로우
```
노트 생성 → 원자적 저장 → 자동 인덱싱 → 백링크 동기화 → PARA 분류
파일 변경 → 감시 감지 → 백링크 갱신 → 인덱스 업데이트
검색 요청 → FTS 검색 + 링크 분석 → 점수 결합 → 결과 반환
```

## 📊 현재 상태

### ✅ 완전 구현 (90%)
- **MCP 서버 코어**: 프로토콜, CLI, 툴 레지스트리
- **저장소 관리**: 원자적 쓰기, 감시, 백링크, PARA
- **검색 엔진**: FTS + 링크 그래프 하이브리드
- **Olima 연상 엔진**: 세션 연관 추천, 컨텍스트 관리, 리플렉션 요약
- **Zettelkasten**: 백링크 관리, 고아 노트 탐지
- **Docker 배포**: 경량 Alpine 이미지 + `/vault` 볼륨 마운트

### 🔄 개발 중 (10%)
- **배포 최적화**: CI/CD 파이프라인, 보안 스캔 자동화

### 🎯 주요 성과
- **실제 동작**: Claude에서 즉시 사용 가능
- **성능**: SQLite FTS5 + WAL 모드로 고속 검색
- **안정성**: 원자적 쓰기 + 재시도로 데이터 보호
- **확장성**: 모듈화된 패키지로 유지보수 용이
- **Olima 연상 엔진**: 세션 추천/컨텍스트/리플렉션 도구와 테스트 커버리지 확보
- **Docker 지원**: 경량 이미지 + 비루트 사용자 + `/vault` 볼륨으로 손쉬운 배포

## 📚 문서 및 개발

### 문서
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 시스템 아키텍처 및 구현 상세
- [`docs/ROADMAP.md`](docs/ROADMAP.md): 개발 로드맵 및 진행 상황
- [`packages/storage-md/README.md`](packages/storage-md/README.md): 파일 관리 API
- [`packages/index-search/README.md`](packages/index-search/README.md): 검색 엔진 API

### 개발 환경
```bash
# 전체 빌드
npm run build

# 개발 모드 (watch)
npm run dev

# 테스트
npm test
npm run test:watch

# 린트 및 타입 체크
npm run lint
npm run typecheck
```

## 라이선스
TBD
