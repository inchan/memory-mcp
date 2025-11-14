# Memory-MCP MVP 로드맵 (3개월)

> **작성일**: 2025-11-12
> **대상 기간**: Week 1-12 (3개월)
> **개발 리소스**: 단독 개발자, 주 20-30시간 (월 80-120시간)
> **목표**: v0.1.0-alpha npm 배포

---

## 📊 Executive Summary

### 현재 상태
- **아키텍처**: ✅ 설계 완료
- **구현 진행도**: ~35% (index-search, common 완료)
- **테스트 커버리지**: ~5% (4개 테스트 파일)
- **배포**: ❌ 미배포

### MVP 범위 결정
**포함 (MUST-HAVE):**
- ✅ MCP 서버 코어 (E1)
- ✅ Markdown 저장소 (E2)
- ✅ FTS5 검색 + 링크 그래프 (E3)
- ✅ 기본 Zettelkasten 링킹 (E5)
- ✅ npm 배포 (E6)

**제외 (v2.0 이후):**
- ❌ Olima 연상 엔진 완전 구현 (E4) → 기본 랭킹 프레임워크로 대체
- ❌ Docker 이미지 (E6-2)
- ❌ 고급 CI/CD (E6-3) → 기본만

### 성공 지표
| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| npm 배포 | v0.1.0-alpha | npm registry 확인 |
| 테스트 커버리지 | ≥ 50% | Jest coverage |
| 핵심 MCP 도구 | 10개 이상 | 도구 목록 |
| 검색 성능 (1K 노트) | < 120ms P95 | 벤치마크 |
| 문서화 | README + API 문서 | 완성도 |
| 초기 사용자 | 5-10명 | GitHub stars/issues |

---

## 🗓 마일스톤 개요

| 마일스톤 | 기간 | 주요 목표 | DoD |
|---------|------|-----------|-----|
| **M1: Foundation** | Week 1-3 | 기초 인프라 + 핵심 CRUD | MCP 서버 실행, 5개 기본 도구 작동 |
| **M2: Search & Link** | Week 4-6 | 검색/링킹 완성 | FTS5 검색, 백링크, 10개 도구 작동 |
| **M3: Quality & Test** | Week 7-9 | 테스트 + 안정화 | 50% 커버리지, 주요 버그 수정 |
| **M4: Deploy & Launch** | Week 10-12 | 문서화 + 배포 | npm 배포, 마켓플레이스 등록 |

---

## 📅 Week-by-Week 계획

### 🏗 Milestone 1: Foundation (Week 1-3)
**목표**: 기본 MCP 서버 실행, 노트 CRUD 작동

#### Week 1: 프로젝트 설정 & Storage 계층
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| 라이선스 결정 및 추가 | LICENSE (MIT) | 1h | Dev | TODO |
| package.json 최종 설정 | 빌드/배포 스크립트 | 2h | Dev | TODO |
| CI 기본 설정 | GitHub Actions (빌드+테스트) | 3h | Dev | TODO |
| storage-md 완성 | CRUD 함수, Front Matter 파싱 | 12h | Dev | TODO |
| 원자적 쓰기 구현 | temp → rename 패턴 | 4h | Dev | TODO |
| 유닛 테스트 (storage) | 10개 테스트 케이스 | 8h | Dev | TODO |

**DoD (Definition of Done):**
- [ ] MIT 라이선스 파일 존재
- [ ] `npm run build` 성공
- [ ] GitHub Actions 빌드 통과
- [ ] storage-md 패키지에서 노트 생성/읽기/수정/삭제 가능
- [ ] Front Matter 파싱 및 검증 작동
- [ ] 원자적 쓰기 테스트 통과
- [ ] 테스트 커버리지 storage-md ≥ 60%

**리스크:**
- ⚠️ Front Matter 스키마 복잡도 → Zod 사용으로 완화
- ⚠️ 파일 시스템 경쟁 조건 → 원자적 쓰기로 해결

---

#### Week 2: MCP 서버 코어 구현
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| MCP 프로토콜 서버 설정 | Server 클래스, stdio 연결 | 6h | Dev | TODO |
| 도구 스키마 정의 | 5개 기본 도구 (CRUD) 스키마 | 4h | Dev | TODO |
| create_note 도구 구현 | MCP tool handler | 4h | Dev | TODO |
| read_note 도구 구현 | MCP tool handler | 3h | Dev | TODO |
| list_notes 도구 구현 | 페이지네이션 포함 | 5h | Dev | TODO |
| 에러 처리 통합 | 표준 에러 응답 | 4h | Dev | TODO |
| 통합 테스트 | 5개 도구 E2E 테스트 | 4h | Dev | TODO |

**DoD:**
- [ ] `npx memory-mcp --vault ./test-vault` 실행 가능
- [ ] create_note 도구로 노트 생성 성공
- [ ] read_note 도구로 노트 읽기 성공
- [ ] list_notes 도구로 목록 조회 성공
- [ ] 에러 시 명확한 에러 메시지 반환
- [ ] 통합 테스트 5개 이상 통과

**리스크:**
- ⚠️ MCP SDK 버전 호환성 → 최신 stable 버전 고정
- ⚠️ stdio 통신 디버깅 어려움 → 로그 파일로 디버그

---

#### Week 3: 추가 CRUD 도구 & 설정 관리
**우선순위**: ⭐⭐ HIGH

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| update_note 도구 구현 | MCP tool handler | 4h | Dev | TODO |
| delete_note 도구 구현 | MCP tool handler | 3h | Dev | TODO |
| 설정 파일 로딩 | .memory-mcp.yaml 파싱 | 4h | Dev | TODO |
| CLI 옵션 파싱 | commander 통합 | 3h | Dev | TODO |
| 환경변수 병합 | 우선순위: CLI > ENV > File | 3h | Dev | TODO |
| 로깅 인프라 | 구조적 로그 (JSON) | 4h | Dev | TODO |
| M1 통합 테스트 | 전체 워크플로우 테스트 | 6h | Dev | TODO |
| M1 문서화 | API 문서 초안 | 3h | Dev | TODO |

**DoD:**
- [ ] 5개 CRUD 도구 모두 작동 (create/read/update/delete/list)
- [ ] `.memory-mcp.yaml` 설정 파일 지원
- [ ] CLI 옵션으로 vault 경로 지정 가능
- [ ] 환경변수 `MEMORY_MCP_VAULT` 지원
- [ ] 로그 파일 생성 및 JSON 포맷
- [ ] M1 통합 테스트 통과
- [ ] API 문서 초안 작성 (5개 도구)

**리스크:**
- ⚠️ 설정 병합 로직 복잡도 → 명확한 우선순위 문서화

---

### 🔍 Milestone 2: Search & Link (Week 4-6)
**목표**: 검색 및 링킹 기능 완성, 10개 도구 제공

#### Week 4: FTS5 검색 통합
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| index-search 통합 | MCP 서버에서 호출 | 4h | Dev | TODO |
| search_notes 도구 구현 | 키워드 검색 | 5h | Dev | TODO |
| 증분 인덱싱 구현 | 파일 변경 시 자동 재인덱싱 | 6h | Dev | TODO |
| 파일 워처 통합 | chokidar → 인덱스 업데이트 | 5h | Dev | TODO |
| 검색 필터 추가 | 태그, 날짜, 카테고리 필터 | 6h | Dev | TODO |
| 성능 최적화 | 인덱싱 시간 < 3초 (100노트) | 4h | Dev | TODO |

**DoD:**
- [ ] search_notes 도구로 키워드 검색 성공
- [ ] 노트 추가 시 자동 인덱싱 (< 3초)
- [ ] 파일 워처로 외부 변경 감지
- [ ] 태그 필터 작동 (`tags: ["tag1"]`)
- [ ] 날짜 범위 필터 작동
- [ ] 검색 응답 시간 < 120ms (1K 노트)

**리스크:**
- ⚠️ 인덱싱 성능 → SQLite 트랜잭션 배치 처리
- ⚠️ 파일 워처 이벤트 폭주 → debounce 구현

---

#### Week 5: 링크 그래프 & Zettelkasten
**우선순위**: ⭐⭐ HIGH

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| 링크 파싱 구현 | `[[link]]` 및 UID 지원 | 5h | Dev | TODO |
| link_notes 도구 구현 | 노트 간 링크 생성 | 4h | Dev | TODO |
| get_backlinks 도구 구현 | 역링크 조회 | 4h | Dev | TODO |
| get_related_notes 도구 구현 | 링크 그래프 탐색 | 5h | Dev | TODO |
| 백링크 인덱스 생성 | 역참조 인덱스 | 4h | Dev | TODO |
| 링크 무결성 검사 | 깨진 링크 탐지 | 4h | Dev | TODO |
| 테스트 (링크) | 링크 관련 테스트 10개 | 4h | Dev | TODO |

**DoD:**
- [ ] `[[노트제목]]` 링크 파싱 성공
- [ ] link_notes로 노트 연결 가능
- [ ] get_backlinks로 역링크 조회
- [ ] get_related_notes로 연결된 노트 탐색
- [ ] 깨진 링크 리포트 생성
- [ ] 링크 관련 테스트 커버리지 ≥ 50%

**리스크:**
- ⚠️ 순환 링크 처리 → 깊이 제한 (depth limit)
- ⚠️ 링크 파싱 성능 → 정규식 최적화

---

#### Week 6: PARA 조직 & 추가 도구
**우선순위**: ⭐ MEDIUM

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| PARA 폴더 구조 생성 | Projects/Areas/Resources/Archives | 3h | Dev | TODO |
| organize_para 도구 구현 | 노트 분류 제안 | 6h | Dev | TODO |
| search_by_tag 도구 구현 | 태그 기반 검색 | 3h | Dev | TODO |
| get_stats 도구 구현 | 통계 정보 (노트 수, 링크 수) | 4h | Dev | TODO |
| export_graph 도구 구현 | 그래프 시각화 데이터 | 5h | Dev | TODO |
| M2 통합 테스트 | 10개 도구 전체 테스트 | 6h | Dev | TODO |
| M2 문서화 | API 문서 완성 (10개 도구) | 3h | Dev | TODO |

**DoD:**
- [ ] PARA 폴더 자동 생성
- [ ] organize_para로 노트 분류 제안
- [ ] search_by_tag로 태그 검색
- [ ] get_stats로 통계 조회
- [ ] export_graph로 JSON 그래프 데이터 생성
- [ ] 10개 MCP 도구 모두 작동
- [ ] API 문서 10개 도구 모두 문서화

**리스크:**
- ⚠️ PARA 자동 분류 정확도 → 규칙 기반으로 시작, 향후 개선

---

### ✅ Milestone 3: Quality & Test (Week 7-9)
**목표**: 테스트 커버리지 50%, 안정화

#### Week 7: 테스트 커버리지 확대
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| storage-md 테스트 확대 | 커버리지 70%+ | 8h | Dev | TODO |
| index-search 테스트 확대 | 커버리지 60%+ | 8h | Dev | TODO |
| mcp-server 테스트 확대 | 커버리지 50%+ | 8h | Dev | TODO |
| E2E 테스트 시나리오 | 5개 실제 사용 시나리오 | 6h | Dev | TODO |

**DoD:**
- [ ] 전체 테스트 커버리지 ≥ 50%
- [ ] storage-md ≥ 70%
- [ ] index-search ≥ 60%
- [ ] mcp-server ≥ 50%
- [ ] E2E 테스트 5개 통과

**리스크:**
- ⚠️ 테스트 작성 시간 부족 → 핵심 경로 우선

---

#### Week 8: 성능 최적화 & 버그 수정
**우선순위**: ⭐⭐ HIGH

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| 성능 벤치마크 | 1K, 5K, 10K 노트 테스트 | 6h | Dev | TODO |
| 검색 최적화 | P95 < 120ms 달성 | 6h | Dev | TODO |
| 인덱싱 최적화 | 증분 < 3초, 전체 < 5분 | 6h | Dev | TODO |
| 메모리 프로파일링 | 메모리 누수 제거 | 4h | Dev | TODO |
| 버그 수정 | 발견된 버그 수정 | 8h | Dev | TODO |

**DoD:**
- [ ] 검색 P95 < 120ms (1K 노트)
- [ ] 증분 인덱싱 < 3초 (100 노트)
- [ ] 전체 재인덱싱 < 5분 (10K 노트)
- [ ] 메모리 누수 없음
- [ ] 주요 버그 0개

**리스크:**
- ⚠️ 성능 목표 미달성 → 범위 축소 (1K 노트 기준으로 조정)

---

#### Week 9: 보안 & 안정화
**우선순위**: ⭐⭐ HIGH

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| 민감정보 마스킹 구현 | 정규식 기반 마스킹 | 6h | Dev | TODO |
| 입력 검증 강화 | Zod 스키마 검증 | 4h | Dev | TODO |
| 에러 처리 개선 | 명확한 에러 메시지 | 4h | Dev | TODO |
| 로그 보안 검토 | 민감정보 로그 제거 | 3h | Dev | TODO |
| 원자적 쓰기 검증 | fsync 보장 테스트 | 4h | Dev | TODO |
| 보안 테스트 | SQL Injection 등 | 4h | Dev | TODO |
| M3 통합 테스트 | 전체 안정성 테스트 | 5h | Dev | TODO |

**DoD:**
- [ ] 민감정보 마스킹 작동 (이메일, 전화번호 등)
- [ ] 모든 입력 Zod 검증
- [ ] 에러 메시지 명확하고 안전
- [ ] 로그에 민감정보 없음
- [ ] 원자적 쓰기 테스트 통과
- [ ] 보안 테스트 통과
- [ ] 안정성 테스트 통과

**리스크:**
- ⚠️ 민감정보 탐지 정확도 → 95% 목표, 점진적 개선

---

### 🚀 Milestone 4: Deploy & Launch (Week 10-12)
**목표**: npm 배포, 문서화, 초기 사용자 확보

#### Week 10: 문서화
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| README 업데이트 | 설치, 빠른 시작, 예제 | 6h | Dev | TODO |
| API 레퍼런스 완성 | 10개 도구 상세 문서 | 8h | Dev | TODO |
| CHANGELOG 작성 | v0.1.0 변경 사항 | 2h | Dev | TODO |
| CONTRIBUTING.md 작성 | 기여 가이드 | 4h | Dev | TODO |
| 사용 예제 작성 | 5개 실제 시나리오 | 6h | Dev | TODO |
| 아키텍처 다이어그램 | 구조도, 시퀀스 다이어그램 | 4h | Dev | TODO |

**DoD:**
- [ ] README에 설치 및 빠른 시작 가이드
- [ ] 10개 도구 API 문서 완성
- [ ] CHANGELOG.md 작성
- [ ] CONTRIBUTING.md 작성
- [ ] 5개 사용 예제 작성
- [ ] 아키텍처 다이어그램 포함

**리스크:**
- ⚠️ 문서화 시간 부족 → 핵심 문서 우선

---

#### Week 11: npm 배포 준비
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| package.json 최종 검토 | 메타데이터, 키워드 | 2h | Dev | TODO |
| npm 계정 설정 | 2FA 활성화 | 1h | Dev | TODO |
| 배포 스크립트 작성 | publish.sh | 3h | Dev | TODO |
| CI/CD 배포 자동화 | GitHub Actions | 5h | Dev | TODO |
| 배포 전 체크리스트 | 최종 검증 | 4h | Dev | TODO |
| v0.1.0-alpha 배포 | npm publish | 2h | Dev | TODO |
| 배포 후 검증 | 설치 테스트 | 3h | Dev | TODO |
| 배포 공지 준비 | 블로그 포스트 초안 | 10h | Dev | TODO |

**DoD:**
- [ ] npm에 @memory-mcp/mcp-server 배포
- [ ] `npx memory-mcp` 설치 및 실행 가능
- [ ] GitHub Actions 배포 자동화
- [ ] 배포 후 설치 테스트 통과
- [ ] 블로그 포스트 초안 완성

**리스크:**
- ⚠️ npm 퍼블리싱 실패 → 사전 테스트 계정으로 연습
- ⚠️ 배포 후 치명적 버그 → 롤백 계획 준비

---

#### Week 12: 출시 & 초기 사용자 확보
**우선순위**: ⭐⭐⭐ CRITICAL

| 작업 | 산출물 | 시간 | 담당 | 상태 |
|------|--------|------|------|------|
| MCP 마켓플레이스 등록 | Smithery, PulseMCP 등 | 4h | Dev | TODO |
| 블로그 포스트 발행 | Dev.to, Medium | 2h | Dev | TODO |
| Reddit 공지 | r/ModelContextProtocol | 1h | Dev | TODO |
| Twitter/X 공지 | 스레드 작성 | 1h | Dev | TODO |
| GitHub Discussions 활성화 | Q&A, 피드백 섹션 | 2h | Dev | TODO |
| 초기 사용자 지원 | 이슈/질문 대응 | 10h | Dev | TODO |
| 피드백 수집 | 구조화된 폼 | 3h | Dev | TODO |
| 버그 수정 (긴급) | 초기 버그 패치 | 7h | Dev | TODO |

**DoD:**
- [ ] 3개 이상 마켓플레이스 등록
- [ ] 블로그 포스트 발행
- [ ] Reddit, Twitter 공지
- [ ] GitHub Discussions 활성화
- [ ] 초기 사용자 5명 이상 확보
- [ ] 초기 피드백 수집
- [ ] 긴급 버그 패치 배포

**리스크:**
- ⚠️ 사용자 관심 부족 → 다양한 채널 활용
- ⚠️ 초기 버그 폭주 → 빠른 대응 체계

---

## 🎯 필수 vs 선택 기능 분류

### ✅ 필수 기능 (MUST-HAVE for v0.1.0)

**MCP 도구 (10개):**
1. ✅ create_note - 노트 생성
2. ✅ read_note - 노트 읽기
3. ✅ update_note - 노트 수정
4. ✅ delete_note - 노트 삭제
5. ✅ list_notes - 노트 목록
6. ✅ search_notes - 키워드 검색
7. ✅ link_notes - 링크 생성
8. ✅ get_backlinks - 역링크 조회
9. ✅ get_related_notes - 연결된 노트 탐색
10. ✅ get_stats - 통계 정보

**핵심 기능:**
- ✅ Markdown + YAML Front Matter 저장
- ✅ SQLite FTS5 검색
- ✅ 링크 그래프 (백링크)
- ✅ PARA 폴더 구조
- ✅ 파일 워처 (자동 인덱싱)
- ✅ CLI 및 설정 관리
- ✅ 원자적 쓰기
- ✅ 민감정보 마스킹

### ⚠️ 선택 기능 (NICE-TO-HAVE, v0.2.0+)

**추가 MCP 도구:**
- search_by_tag - 태그 검색 (간단하면 포함)
- organize_para - PARA 분류 제안 (시간 있으면)
- export_graph - 그래프 시각화 데이터 (시간 있으면)

**고급 기능 (v2.0):**
- ❌ Olima 연상 엔진 (완전 구현)
- ❌ 벡터 임베딩 검색
- ❌ 고아노트 자동 연결 제안
- ❌ 세션 컨텍스트 관리
- ❌ 리플렉션 (세션 요약)
- ❌ Docker 이미지
- ❌ 고급 CI/CD (보안 스캔 등)

---

## ⚠️ 리스크 및 의존성

### 주요 리스크

| 리스크 | 확률 | 영향 | 완화 전략 |
|-------|------|------|----------|
| 테스트 작성 시간 부족 | HIGH | HIGH | 핵심 경로 우선, 50% 목표 고수 |
| 성능 목표 미달성 | MEDIUM | MEDIUM | 1K 노트 기준으로 조정 |
| npm 배포 실패 | LOW | HIGH | 사전 테스트 계정 연습 |
| 초기 사용자 확보 실패 | MEDIUM | MEDIUM | 다양한 채널 동시 활용 |
| MCP SDK 버전 호환성 | LOW | HIGH | 최신 stable 버전 고정 |
| 단독 개발 번아웃 | MEDIUM | HIGH | 주 20-30시간 엄수, 휴식 |
| 범위 크리프 | HIGH | HIGH | MVP 범위 엄격히 준수 |

### 의존성 관리

**기술 의존성:**
- Node.js 18+ (안정적)
- TypeScript 5+ (안정적)
- MCP SDK (버전 고정 필요)
- better-sqlite3 (안정적)
- gray-matter (안정적)
- chokidar (안정적)

**외부 의존성:**
- npm 레지스트리 (배포)
- GitHub Actions (CI/CD)
- MCP 마켓플레이스 (등록 승인)

---

## 📊 성공 지표 (KPIs)

### 배포 지표
- ✅ npm v0.1.0-alpha 배포 완료
- ✅ 10개 MCP 도구 작동
- ✅ 테스트 커버리지 ≥ 50%
- ✅ 3개 마켓플레이스 등록

### 기술 지표
- ✅ 검색 P95 < 120ms (1K 노트)
- ✅ 증분 인덱싱 < 3초 (100 노트)
- ✅ 전체 재인덱싱 < 5분 (10K 노트)
- ✅ 메모리 사용 < 500MB (1K 노트)
- ✅ 데이터 손실 0 (원자적 쓰기)

### 품질 지표
- ✅ 주요 버그 0개 (배포 시)
- ✅ 보안 테스트 통과
- ✅ 문서 완성도 100% (10개 도구)

### 커뮤니티 지표
- 🎯 GitHub stars: 20+ (첫 달)
- 🎯 초기 사용자: 5-10명
- 🎯 Issues/피드백: 5+ (관심 지표)
- 🎯 블로그 조회수: 100+ (첫 주)

---

## 🔄 주간 체크리스트 템플릿

매주 금요일 검토:

```markdown
### Week X Review (YYYY-MM-DD)

#### ✅ 완료한 작업
- [ ] 작업 1
- [ ] 작업 2

#### ⏳ 진행 중 작업
- [ ] 작업 3 (70% 완료)

#### ❌ 미완료/차단
- [ ] 작업 4 (이유: ...)

#### 📊 메트릭
- 테스트 커버리지: X%
- 완료한 도구: X/10
- 발견된 버그: X개

#### 🔄 다음 주 계획
- 우선순위 1: ...
- 우선순위 2: ...

#### ⚠️ 리스크 업데이트
- 새로운 리스크: ...
- 완화된 리스크: ...

#### 💡 배운 점
- ...
```

---

## 🎓 교훈 및 원칙

### 개발 원칙
1. **MVP 범위 엄수**: Olima는 v2.0, Docker는 v2.0
2. **테스트 우선**: 50% 커버리지 필수
3. **문서화 동시 진행**: 코드 작성과 동시에 문서화
4. **성능 목표 현실적**: 1K 노트 기준, 점진적 확장
5. **피드백 기반 개선**: 초기 사용자 의견 적극 반영

### 시간 관리
- 주 20-30시간 엄수 (번아웃 방지)
- 매주 금요일 리뷰 및 계획 조정
- 범위 크리프 경고 시 즉시 조정

### 품질 기준
- 모든 PR은 테스트 포함
- 커밋 메시지 Conventional Commits 준수
- 코드 리뷰 (자가 리뷰) 체크리스트 사용

---

## 📅 다음 단계 (v0.2.0+)

**v0.2.0 (3개월 후):**
- 벡터 임베딩 검색
- 고아노트 자동 연결
- 성능 개선 (10K 노트 기준)
- 추가 MCP 도구 5개

**v1.0.0 (6개월 후):**
- Olima 연상 엔진 (기본 구현)
- Docker 이미지
- 고급 CI/CD
- 프로덕션 준비 (안정성, 보안)

**v2.0.0 (12개월 후):**
- Olima 완전 구현 (세션 컨텍스트, 리플렉션)
- 팀 협업 기능 (선택)
- 클라우드 동기화 (선택)
- 플러그인 시스템

---

## 📝 결론

이 3개월 MVP 로드맵은 **실질적이고 달성 가능한 목표**에 초점을 맞췄습니다:

**핵심 전략:**
1. ✂️ **범위 축소**: Olima → v2.0, Docker → v2.0
2. 🎯 **MVP 집중**: 10개 핵심 MCP 도구
3. ✅ **품질 우선**: 50% 테스트 커버리지
4. 📚 **문서화 중시**: 사용자 온보딩 용이
5. 🚀 **빠른 배포**: 3개월 내 npm 배포

**성공 정의:**
- npm에 v0.1.0-alpha 배포
- 10개 MCP 도구 작동
- 초기 사용자 5-10명 확보
- 테스트 커버리지 50%+
- 명확한 문서화

**다음 액션:**
1. Week 1 작업 시작 (라이선스, CI, storage-md)
2. 매주 금요일 리뷰 미팅
3. 리스크 모니터링
4. 피드백 루프 설정

---

*"Good code is simple, clear, and purposeful."* - docs/DEVELOPMENT_GUIDELINES.md

**Let's build! 🚀**
