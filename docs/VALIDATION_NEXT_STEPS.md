# 검증 Next Steps - Gap Analysis & Roadmap

> **최종 업데이트**: 2025-11-13
> **핵심 원칙**: "검증을 어떻게 할 것인가?"를 실제 코드베이스에 적용

---

## 📊 현재 상태 분석 (2025-11-13)

### 실제 측정 결과

```bash
# 테스트 커버리지
npm run test:coverage
→ 전체: 53.27% ❌ (목표: 80%+)

# 테스트 결과
→ 140 passed, 13 failed, 1 skipped
```

### ✅ 이미 구현된 검증

1. **CI/CD 파이프라인** ✅
   - `.github/workflows/ci.yml`: Lint + Type check + Unit/Integration
   - `.github/workflows/performance.yml`: 주간 성능 테스트
   - **Status**: 완료 but E2E 비활성화 ⚠️

2. **테스트 인프라** ✅
   - Jest 설정, 16개 테스트 파일
   - Unit (6) + Integration (2) + E2E (1) + Performance (2)
   - **Status**: 구현됨, 확장 필요 ⚠️

3. **타입 검증 (Zod)** ✅
   - 4개 파일, 59개 검증 포인트
   - **Status**: 부분적, 확장 필요 ⚠️

---

## 🚨 Critical Gaps (문서 vs 실제)

| 검증 레벨 | 목표 (VALIDATION_STRATEGY.md) | 현재 상태 | Gap |
|----------|--------------------------|---------|-----|
| **Level 1: 타입** | 모든 공개 인터페이스 | 4개 파일만 | ⚠️ 부분적 |
| **Level 2: 단위** | 80%+ 커버리지 | **53.27%** | ❌ **-26.73%** |
| **Level 3: 통합** | 패키지 간 경계 | 2개 파일 | ⚠️ 부족 |
| **Level 4: E2E** | MCP 전체 시스템 | **비활성화** | ❌ **중단됨** |
| **Level 5: 성능/보안** | KPI 자동 검증 | continue-on-error | ⚠️ 느슨함 |

### 0% 커버리지 패키지 ❌❌❌
```
assoc-engine/src:      0.00%  (⚠️  아직 구현 안 됨 - TODO)
mcp-server/src (CLI):  0.00%  (CLI 미검증)
```

**중요 발견 (2025-11-14)**:
- `assoc-engine`: 실제 구현 없음, `export const PACKAGE_VERSION = '0.1.0';` 만 존재
- **결론**: 테스트를 작성할 기능이 없음 → 구현 후 테스트 작성
- **수정된 우선순위**: mcp-server CLI 테스트 먼저 작성

### < 25% 커버리지 ❌❌
```
watcher:     13.79%  (파일 감시 미검증)
link-graph:  20.97%  (링크 그래프 미검증)
```

---

## 🎯 3주 실행 계획 (구체적, 측정 가능)

### Week 1: Critical Issues
**목표**: E2E 활성화 + 구현된 0% 코드 커버리지 제거

- [x] **Day 1**: E2E stdio 이슈 수정, 재활성화 ✅
  - 결과: 13/13 E2E 테스트 통과
  - Commit: `a6a9bb4` - fix(e2e): fix E2E test path and re-enable in CI

- [ ] **Day 2-3**: mcp-server CLI 테스트 (0% → 60%+)
  - ⚠️  **수정**: assoc-engine → mcp-server CLI로 변경
  - 이유: assoc-engine은 아직 구현되지 않음 (구현 후 테스트 작성)

- [ ] **Day 4-5**: 실패한 테스트 수정 or watcher 테스트 시작
  - 13개 실패 테스트 수정
  - 또는 watcher 커버리지 향상 시작

**검증**:
```bash
npm run test:e2e  # ✅ 통과 (완료)
npm run test:coverage | grep "mcp-server/src"  # cli.ts, server.ts 60%+ 목표
```

---

### Week 2: Coverage 80% 달성
**목표**: 전체 커버리지 80%+

- [ ] **Day 1-2**: watcher 테스트 (13% → 70%+)
- [ ] **Day 3-4**: link-graph 테스트 (20% → 70%+)
- [ ] **Day 5**: 실패한 13개 테스트 수정

**검증**:
```bash
npm test  # 0 failures
npm run test:coverage  # 80%+ 확인
```

---

### Week 3: Hardening
**목표**: 검증 자동화 강화

- [ ] **Day 1**: Zod 검증 확장 (10개+ 파일)
- [ ] **Day 2**: 성능 테스트 필수화 (continue-on-error → false)
- [ ] **Day 3**: 보안 취약점 해결 (`npm audit`)
- [ ] **Day 4-5**: 문서 업데이트 및 검증

**검증**:
```bash
grep -r "from 'zod'" packages | wc -l  # 10+ 확인
npm audit  # 0 high/critical
```

---

## 📋 완료된 작업 (Historical Context)

### ✅ 1단계: MCP 표준 준수 검증 도구 선택 및 설정

다음 작업들이 완료되었습니다:

1. **MCP Inspector 설치**
   - `@modelcontextprotocol/inspector` 패키지 설치
   - `npm run validate:inspector` 스크립트 추가

2. **MCP SDK Client 기반 자동화 테스트**
   - `packages/mcp-server/__tests__/mcp-protocol.test.ts` 작성
   - 13개 테스트 모두 통과
   - 검증 항목:
     - ✅ 서버 초기화 및 연결
     - ✅ Tool 목록 조회 및 스키마 검증
     - ✅ Tool 실행 (create_note, search_memory)
     - ✅ 에러 응답 형식 (MCP 표준 준수)
     - ✅ 통합 워크플로우 (노트 작성 → 검색)

3. **검증 스크립트**
   - `scripts/validate-mcp.sh` 생성
   - `npm run test:mcp` 명령어로 MCP 프로토콜 테스트 실행 가능

4. **버그 수정**
   - Tool schema의 `type: "object"` 누락 문제 해결 (`packages/mcp-server/src/tools/registry.ts:890-903`)
   - Front Matter 직렬화 시 undefined 처리 문제 해결 (`packages/storage-md/src/front-matter.ts:157-189`)

---

## 🎯 다음 단계: 독립적인 테스트 스위트 구축

### 현재 상태

- 테스트 디렉토리 구조 생성 시작:
  ```
  packages/mcp-server/__tests__/
  ├── unit/           # 유닛 테스트
  ├── integration/    # 통합 테스트
  ├── e2e/           # E2E 테스트 (mcp-protocol.test.ts 이동 예정)
  └── performance/    # 성능 테스트
  ```

### 작업 항목

#### 1. 테스트 구조 정리 및 분류

**프롬프트:**
```
Memory MCP 프로젝트의 테스트 스위트를 체계적으로 구축해주세요.

현재 상태:
- E2E 테스트: packages/mcp-server/__tests__/mcp-protocol.test.ts (13개 테스트, 모두 통과)
- 기존 테스트들이 packages/*/src/__tests__/ 디렉토리에 흩어져 있음

작업 내용:
1. 기존 mcp-protocol.test.ts를 packages/mcp-server/__tests__/e2e/로 이동
2. 기존 테스트 파일들 분석 및 분류:
   - packages/common/__tests__/index.test.ts
   - packages/storage-md/src/__tests__/storage-md.test.ts
   - packages/index-search/src/__tests__/database.test.ts
   - packages/mcp-server/src/tools/__tests__/execution-policy.test.ts
   - packages/mcp-server/src/tools/__tests__/tool-registry.test.ts

3. 테스트를 다음 카테고리로 분류:
   - unit/: 개별 함수/클래스 단위 테스트
   - integration/: 패키지 간 통합 테스트
   - e2e/: 엔드투엔드 시나리오 테스트
   - performance/: 성능/부하 테스트

4. package.json에 테스트 스크립트 추가:
   - test:unit
   - test:integration
   - test:e2e
   - test:performance
```

#### 2. 유닛 테스트 작성

**프롬프트:**
```
Memory MCP 프로젝트의 각 툴에 대한 유닛 테스트를 작성해주세요.

작성할 테스트 파일:
- packages/mcp-server/__tests__/unit/tools/create-note.test.ts
- packages/mcp-server/__tests__/unit/tools/read-note.test.ts
- packages/mcp-server/__tests__/unit/tools/update-note.test.ts
- packages/mcp-server/__tests__/unit/tools/delete-note.test.ts
- packages/mcp-server/__tests__/unit/tools/list-notes.test.ts
- packages/mcp-server/__tests__/unit/tools/search-memory.test.ts

각 테스트에 포함할 항목:
1. 정상 케이스 테스트
2. 입력 검증 (schema validation) 테스트
3. 에러 핸들링 테스트
4. 경계값 테스트 (빈 문자열, 긴 문자열, 특수문자 등)
5. Mock을 사용한 의존성 격리

참고:
- 기존 툴 구현: packages/mcp-server/src/tools/registry.ts
- 스키마 정의: packages/mcp-server/src/tools/schemas.ts
```

#### 3. 통합 테스트 작성

**프롬프트:**
```
Memory MCP 프로젝트의 패키지 간 통합 테스트를 작성해주세요.

작성할 테스트 파일:
- packages/mcp-server/__tests__/integration/storage-integration.test.ts
  - 노트 작성 → 파일 시스템 저장 확인
  - Front Matter 파싱 및 직렬화 통합

- packages/mcp-server/__tests__/integration/search-integration.test.ts
  - 노트 작성 → 인덱싱 → 검색 플로우
  - FTS5 전문 검색 동작 확인

- packages/mcp-server/__tests__/integration/link-graph.test.ts
  - 노트 간 링크 생성 → 백링크 조회
  - 링크 그래프 탐색

- packages/mcp-server/__tests__/integration/end-to-end-workflow.test.ts
  - 복잡한 시나리오 테스트
  - 노트 생성 → 업데이트 → 검색 → 삭제

테스트 요구사항:
- 실제 파일 시스템 사용 (임시 디렉토리)
- 실제 SQLite 데이터베이스 사용
- 각 테스트 후 정리(cleanup)
- 병렬 실행 가능하도록 격리
```

#### 4. 성능 테스트 작성

**프롬프트:**
```
Memory MCP 프로젝트의 성능 KPI를 검증하는 테스트를 작성해주세요.

KPI 목표 (docs/TECHNICAL_SPEC.md 참고):
- 검색 P95 지연시간 < 120ms (1만 노트 기준)
- 증분 색인 < 3초
- 전체 색인 재빌드(1만 파일) < 5분
- 초기 부팅 후 인덱스 준비 < 8초

작성할 테스트 파일:
- packages/mcp-server/__tests__/performance/search-latency.test.ts
  - 1만 개 노트 생성
  - 100회 검색 실행
  - P95 레이턴시 측정 및 검증

- packages/mcp-server/__tests__/performance/indexing-speed.test.ts
  - 증분 인덱싱 속도 측정
  - 전체 인덱스 재빌드 속도 측정

- packages/mcp-server/__tests__/performance/startup-time.test.ts
  - 서버 시작 시간 측정
  - 인덱스 준비 시간 측정

테스트 요구사항:
- 측정 결과를 파일로 저장 (성능 추이 추적용)
- 성능 저하 시 경고 또는 실패
- CI에서는 타임아웃 고려 (선택적 실행)
```

---

## 🚀 다음 단계: CI/CD 자동화 검증 파이프라인 구성

### 작업 항목

#### 1. GitHub Actions 워크플로우 작성

**프롬프트:**
```
Memory MCP 프로젝트의 CI/CD 파이프라인을 구성해주세요.

작성할 파일:
- .github/workflows/mcp-validation.yml

워크플로우 구성:
1. MCP Protocol Compliance Check
   - MCP Inspector를 사용한 프로토콜 검증
   - npm run validate:inspector

2. Test Suite
   - Unit Tests: npm run test:unit
   - Integration Tests: npm run test:integration
   - E2E Tests: npm run test:e2e
   - Coverage 리포트 생성 및 업로드 (Codecov)

3. Performance Tests (선택적)
   - 매주 1회 실행 (스케줄)
   - PR에서는 건너뛰기
   - npm run test:performance

4. Build Verification
   - npm run build
   - npm run typecheck
   - npm run lint

5. 트리거 조건:
   - push to main
   - pull_request
   - schedule (성능 테스트)

참고:
- Node.js 18.x 매트릭스
- 캐싱 활용 (npm dependencies)
- 병렬 실행 최적화
```

#### 2. 로컬 검증 스크립트 개선

**프롬프트:**
```
기존 scripts/validate-mcp.sh를 개선하여 모든 검증을 한 번에 실행하는 스크립트를 작성해주세요.

개선할 파일:
- scripts/validate-mcp.sh

추가할 기능:
1. 빌드 검증
2. 타입 체크
3. 린트 검증
4. 유닛 테스트
5. 통합 테스트
6. E2E 테스트
7. MCP 프로토콜 준수 검증

각 단계별 진행 상황 표시 (progress indicator)
실패 시 즉시 중단 또는 계속 진행 옵션
최종 요약 리포트

사용법:
./scripts/validate-mcp.sh          # 전체 검증
./scripts/validate-mcp.sh --fast   # 빠른 검증 (유닛 테스트만)
./scripts/validate-mcp.sh --ci     # CI 모드 (상세 로그)
```

#### 3. Pre-commit Hook 설정

**프롬프트:**
```
커밋 전 자동 검증을 위한 pre-commit hook을 설정해주세요.

작성할 파일:
- .husky/pre-commit (또는 간단한 Git hook)

Hook에서 실행할 작업:
1. Staged 파일에 대해서만 lint 실행
2. 관련된 유닛 테스트 실행
3. 타입 체크

선택사항:
- husky + lint-staged 사용 고려
- 또는 간단한 .git/hooks/pre-commit 스크립트

package.json에 필요한 스크립트 추가
```

---

## 📊 검증 완료 기준

모든 작업이 완료되면 다음이 가능해야 합니다:

### 로컬 환경
```bash
# 전체 검증
npm run validate:mcp

# 개별 테스트
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance

# MCP 프로토콜 검증
npm run test:mcp
npm run validate:inspector
```

### CI/CD
- PR 생성 시 자동으로 모든 테스트 실행
- Main 브랜치 푸시 시 전체 검증
- 매주 성능 테스트 자동 실행
- 테스트 커버리지 리포트 자동 생성

### 테스트 커버리지 목표
- 전체: 80%+
- 핵심 모듈 (tools, storage): 90%+

---

## 🔧 참고 파일

### 현재 구현
- MCP 서버: `packages/mcp-server/src/server.ts`
- 툴 레지스트리: `packages/mcp-server/src/tools/registry.ts`
- 스키마 정의: `packages/mcp-server/src/tools/schemas.ts`
- E2E 테스트: `packages/mcp-server/__tests__/mcp-protocol.test.ts`

### 설계 문서
- 기술 스펙: `docs/TECHNICAL_SPEC.md`
- 아키텍처: `docs/ARCHITECTURE.md`
- 로드맵: `docs/ROADMAP.md`

### 현재 테스트 설정
- Jest 설정: `jest.config.js` (루트)
- TypeScript 설정: `tsconfig.json`

---

## 💡 팁

1. **병렬 실행 최적화**: Jest의 `maxWorkers` 옵션 활용
2. **테스트 격리**: 각 테스트마다 별도의 임시 디렉토리 사용
3. **Cleanup**: `afterEach`, `afterAll`에서 테스트 데이터 정리
4. **Mock 전략**: 외부 의존성은 Mock, 내부 통합은 실제 사용
5. **성능 테스트**: CI에서는 선택적 실행 (시간이 오래 걸림)
