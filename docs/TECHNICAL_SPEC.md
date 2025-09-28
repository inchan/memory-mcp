# 기술 명세서

## 🛠 기술 스택

### Runtime & Language
- **Node.js 18+ / TypeScript 5+**
- **Olima Engine**: 로컬 패키지(`@memory-mcp/assoc-engine`)로 번들되어 외부 서비스 불필요
- 선택: Rust (핵심 인덱싱 모듈 최적화 시)

### Core Libraries
- **파일/MD**: `gray-matter`(FM 파싱), `remark`(MD 처리), `chokidar`(FS 워처)
- **검색**: `better-sqlite3` + **SQLite FTS5** (대안: `elasticlunr`)
- **CLI/MCP**: `commander`, MCP 표준 I/O
- **보안**: `zod`(스키마 검증), 선택: `node-keytar`(로컬 키체인)

### Packaging
- `npm` 배포, `npx memory-mcp` 실행
- Docker 이미지: `node:18-alpine` 기반, 볼륨 `/vault`

## 📐 코드 컨벤션
- 변수/함수: `camelCase` / 클래스: `PascalCase` / 상수: `UPPER_SNAKE_CASE`
- 커밋 메시지(Conventional Commits):  
```text
feat: ...
fix: ...
docs: ...
style: ...
refactor: ...
perf: ...
test: ...
chore: ...
```

## 🔒 보안
- 로컬 우선, 네트워크 송출 기본 비활성
- 민감정보(이메일/카드/주민번호 등) **정규식 마스킹**
- 원자적 쓰기(temp 파일 → rename), fsync 보장
- 옵션: Vault 디스크 **암호화**(OS 레벨 또는 앱 제공)

## 📊 관측 가능성(Observability)
- 구조적 로그(JSON), 로테이션
- 핵심 지표: 인덱스 빌드 시간, 검색 P95, 파일 워처 이벤트 드롭 카운트
- 선택: OpenTelemetry Exporter

## 🎯 품질 기준(KPIs)
- 검색 P95 지연시간 < **120ms** (1만 노트 기준, 로컬)
- 색인 재빌드(1만 파일) < **5분** / 증분 색인 < **3초**
- 초기 부팅 후 인덱스 준비 < **8초**
- 데이터 손실 0 (저장 시 **원자적 쓰기** 보장)
- 민감정보 자동 마스킹 **> 95%** 정탐율 (정규식 + 룰)
