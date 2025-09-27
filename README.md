# Memory MCP (Olima + Basic-Memory + Zettelkasten + PARA)

로컬 퍼시스턴트 메모리를 **MCP 서버**로 노출하여, Claude 등 MCP 호환 에이전트에서 즉시 활용할 수 있게 하는 프로젝트입니다.
- 저장: **Markdown + YAML Front Matter**
- 조직: **PARA**(Projects/Areas/Resources/Archives)
- 연결: **Zettelkasten**(UID/백링크/링크 무결성)
- 검색: **SQLite FTS5** + 링크 그래프 (→ 임베딩 유사도 확장)
- 연상: **Olima** 문맥 기반 리랭킹/추천

## 빠른 시작 (개발 모드 예시)
```bash
# (예시) 로컬 실행
npx memory-mcp --vault ~/vault --index ~/.memory-index.db --log-level info

# Claude Desktop 설정(예시: mcpServers 항목)
# {
#   "mcpServers": {
#     "memory": {
#       "command": "npx",
#       "args": ["memory-mcp", "--vault", "~/vault", "--index", "~/.memory-index.db"]
#     }
#   }
# }
```

## 문서
- `docs/ROADMAP.md` : 에픽/기능/스펙 트리 구조와 목표
- `docs/TECHNICAL_SPEC.md` : 기술 스택/보안/관측/KPI
- `docs/ARCHITECTURE.md` : 패키지 구성, 시퀀스 다이어그램, 데이터 모델 예시
- `docs/GOALS.md` : **주요 목표**와 마일스톤/KPI
- `docs/specs/*` : 에픽-기능별 폴더, `plan.md`/`tasks.md`/`<스펙이름>-spec.md`

## 리포 구조(예시)
```
project/
├── packages/
│   ├── mcp-server/      # MCP 인터페이스/툴 정의
│   ├── storage-md/      # 파일 I/O, Front Matter 스키마
│   ├── index-search/    # FTS/그래프 인덱스 & 검색
│   ├── assoc-engine/    # Olima 연상 엔진
│   └── common/          # 스키마/유틸/로깅
└── docs/                # 설계/스펙/로드맵
```

## 코딩 규칙 및 운영
- 규칙: camelCase/PascalCase/UPPER_SNAKE_CASE, Conventional Commits
- 테스트: 유닛/통합/부하, 커버리지 80%+
- 보안: 민감정보 마스킹, 원자적 쓰기, 로컬 우선
- 운영: 구조적 로그(JSON), 로테이션, OpenTelemetry(선택)

## 라이선스
TBD
