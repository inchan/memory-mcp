# 검증 전략 (Validation Strategy)

> **핵심 질문**: "검증을 어떻게 할 것인가?"
>
> **핵심 원칙**: 검증되지 않은 코드는 배포하지 않습니다. 코드를 작성하기 전에 검증 방법부터 정의합니다.

---

## 🎯 검증 우선 개발 프로세스

```
1. 요구사항 정의
2. ✅ 검증 방법 정의 (HOW TO VALIDATE) ← 여기서 시작!
3. 검증 케이스 작성 (테스트 코드)
4. 구현
5. 검증 실행
6. 통과 → 배포 / 실패 → 수정 후 재검증
```

**핵심**: 2번 단계(검증 방법 정의)를 건너뛰지 않습니다.

---

## 📊 검증 5단계 (Validation Levels)

### Level 1: 타입 검증 (Type Validation)
**목적**: 컴파일 타임에 타입 오류 검출

**방법**:
```typescript
// ✅ DO: Zod를 사용한 런타임 타입 검증
import { z } from 'zod';

const NoteSchema = z.object({
  id: z.string().regex(/^\d{8}T\d{6}Z$/),
  title: z.string().min(1).max(200),
  category: z.enum(['Projects', 'Areas', 'Resources', 'Archives']),
  tags: z.array(z.string()).optional(),
  created: z.string().datetime(),
});

type Note = z.infer<typeof NoteSchema>;

// 사용 시 검증
function createNote(data: unknown): Note {
  return NoteSchema.parse(data); // 실패 시 ZodError throw
}
```

**자동화**:
- `npm run typecheck`: TypeScript 타입 체크
- CI에서 빌드 시 자동 실행

**체크리스트**:
- [ ] 모든 공개 인터페이스에 Zod 스키마 정의
- [ ] Front Matter 스키마에 런타임 검증
- [ ] MCP 툴 입력/출력에 검증 추가

---

### Level 2: 단위 테스트 (Unit Tests)
**목적**: 개별 함수/클래스의 동작 검증

**방법**:
```typescript
// src/storage/__tests__/note-parser.test.ts
import { parseNote } from '../note-parser';

describe('parseNote', () => {
  it('should parse valid note with front matter', () => {
    const markdown = `---
id: "20250927T103000Z"
title: "Test Note"
---
Note content`;

    const result = parseNote(markdown);

    expect(result.id).toBe('20250927T103000Z');
    expect(result.title).toBe('Test Note');
    expect(result.content).toBe('Note content');
  });

  it('should throw on invalid front matter', () => {
    const markdown = `---
id: "invalid"
---`;

    expect(() => parseNote(markdown)).toThrow();
  });
});
```

**자동화**:
- `npm test`: Jest 단위 테스트 실행
- `npm run test:coverage`: 커버리지 리포트
- CI에서 모든 PR에 대해 자동 실행

**목표**:
- 테스트 커버리지 **80%+**
- 모든 공개 함수/메서드에 테스트

**체크리스트**:
- [ ] 함수 작성 전 테스트 작성 (TDD)
- [ ] Happy path + Edge cases 모두 테스트
- [ ] 에러 케이스 명시적으로 테스트

---

### Level 3: 통합 테스트 (Integration Tests)
**목적**: 여러 컴포넌트 간 상호작용 검증

**방법**:
```typescript
// src/__tests__/integration/storage-index.test.ts
import { StorageManager } from '../storage';
import { IndexManager } from '../index';

describe('Storage + Index Integration', () => {
  let storage: StorageManager;
  let index: IndexManager;

  beforeEach(async () => {
    storage = new StorageManager({ vaultPath: tempDir });
    index = new IndexManager({ dbPath: tempDbPath });
    await index.initialize();
  });

  it('should index note when created', async () => {
    // Create note via storage
    const note = await storage.createNote({
      title: 'Test',
      content: 'Integration test',
    });

    // Verify it's indexed
    const results = await index.search('Integration test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(note.id);
  });

  afterEach(async () => {
    await cleanup();
  });
});
```

**자동화**:
- `npm run test:integration`: 통합 테스트 실행
- CI에서 PR merge 전 실행

**체크리스트**:
- [ ] 패키지 간 경계(boundary) 테스트
- [ ] 데이터베이스/파일시스템 상호작용 테스트
- [ ] 실제 환경과 유사한 설정 사용

---

### Level 4: E2E 테스트 (End-to-End Tests)
**목적**: MCP 프로토콜을 통한 전체 시스템 검증

**방법**:
```typescript
// src/__tests__/e2e/mcp-server.test.ts
import { MCPClient } from '@modelcontextprotocol/sdk/client';

describe('MCP Server E2E', () => {
  let client: MCPClient;

  beforeEach(async () => {
    // Start MCP server
    client = await startMCPServer();
  });

  it('should create and search notes via MCP', async () => {
    // Create note via MCP tool
    const createResult = await client.callTool('create_note', {
      title: 'E2E Test',
      content: 'Testing MCP protocol',
      category: 'Resources',
    });

    expect(createResult.success).toBe(true);
    const noteId = createResult.data.id;

    // Search via MCP tool
    const searchResult = await client.callTool('search_notes', {
      query: 'MCP protocol',
    });

    expect(searchResult.results).toHaveLength(1);
    expect(searchResult.results[0].id).toBe(noteId);
  });

  afterEach(async () => {
    await stopMCPServer();
  });
});
```

**자동화**:
- `npm run test:e2e`: E2E 테스트 실행
- CI에서 릴리스 전 실행

**체크리스트**:
- [ ] 모든 MCP 툴 테스트
- [ ] 에러 응답 형식 검증
- [ ] MCP 프로토콜 스펙 준수 확인

---

### Level 5: 성능 & 보안 검증 (Performance & Security)
**목적**: 비기능 요구사항 검증

#### 5.1 성능 검증

**방법**:
```typescript
// src/__tests__/performance/search-benchmark.test.ts
import { performance } from 'perf_hooks';

describe('Search Performance', () => {
  it('should complete search within 120ms (P95)', async () => {
    const iterations = 100;
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await index.search('test query');
      const end = performance.now();
      latencies.push(end - start);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(iterations * 0.95)];

    expect(p95).toBeLessThan(120); // P95 < 120ms
  });
});
```

**자동화**:
- `npm run test:performance`: 성능 벤치마크
- CI에서 주기적으로 실행, 회귀 감지

**KPI 목표**:
- [ ] 검색 P95 < 120ms (10k notes)
- [ ] 증분 인덱싱 < 3초
- [ ] 전체 인덱스 재빌드 < 5분 (10k files)
- [ ] 초기 부팅 < 8초

#### 5.2 보안 검증

**방법**:
```typescript
// src/__tests__/security/sensitive-data.test.ts
import { maskSensitiveData } from '../security';

describe('Sensitive Data Masking', () => {
  it('should mask API keys', () => {
    const input = 'API_KEY=sk-1234567890abcdef';
    const masked = maskSensitiveData(input);
    expect(masked).toContain('API_KEY=***MASKED***');
    expect(masked).not.toContain('sk-1234567890');
  });

  it('should mask email addresses', () => {
    const input = 'Contact: user@example.com';
    const masked = maskSensitiveData(input);
    expect(masked).toContain('***@***.***');
  });
});
```

**자동화**:
- `npm run test:security`: 보안 테스트
- 정기적인 보안 스캔 (npm audit, snyk)

**체크리스트**:
- [ ] 민감정보 마스킹 정탐율 >95%
- [ ] 의존성 취약점 스캔 (npm audit)
- [ ] 입력 검증 (SQL injection, XSS 방지)

---

## 🔄 CI/CD 검증 파이프라인

```yaml
# .github/workflows/validation.yml
name: Validation Pipeline

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      # Level 1: Type Validation
      - name: Type Check
        run: npm run typecheck

      # Level 2: Unit Tests
      - name: Unit Tests
        run: npm run test:unit

      - name: Coverage Check
        run: npm run test:coverage
        # Fail if coverage < 80%

      # Level 3: Integration Tests
      - name: Integration Tests
        run: npm run test:integration

      # Level 4: E2E Tests
      - name: E2E Tests
        run: npm run test:e2e

      # Level 5: Performance Tests
      - name: Performance Tests
        run: npm run test:performance

      # Level 5: Security Scan
      - name: Security Audit
        run: npm audit --audit-level=moderate
```

---

## ✅ 검증 체크리스트 (Validation Checklist)

### 코드 작성 전 (Before Writing Code)

- [ ] 요구사항이 명확한가?
- [ ] **검증 방법이 정의되었는가?** ← 가장 중요!
- [ ] 검증 케이스를 나열했는가?
- [ ] 실패 조건을 정의했는가?

### 구현 중 (During Implementation)

- [ ] 테스트를 먼저 작성했는가? (TDD)
- [ ] 타입 검증을 추가했는가? (Zod)
- [ ] 에러 케이스를 처리했는가?
- [ ] 로그를 추가했는가?

### PR 제출 전 (Before PR)

- [ ] 모든 테스트가 통과하는가?
- [ ] 커버리지가 80% 이상인가?
- [ ] Lint/Type 에러가 없는가?
- [ ] 문서를 업데이트했는가?

### 릴리스 전 (Before Release)

- [ ] E2E 테스트가 통과하는가?
- [ ] 성능 KPI를 만족하는가?
- [ ] 보안 스캔이 통과하는가?
- [ ] CHANGELOG를 업데이트했는가?

---

## 🚫 검증 실패 시 대응 (Failure Response)

### 원칙

1. **검증 실패 = 배포 금지**
2. **우회 금지**: "나중에 고치겠다"는 없습니다
3. **즉시 수정**: 실패한 검증은 즉시 수정합니다

### 대응 프로세스

```
검증 실패 감지
    ↓
원인 분석
    ↓
수정 방법 결정
    ↓
수정 구현
    ↓
재검증
    ↓
통과 → 진행 / 실패 → 반복
```

---

## 📈 검증 메트릭 (Validation Metrics)

### 추적할 지표

- **테스트 커버리지**: 80%+ 유지
- **테스트 실행 시간**: < 5분 (전체)
- **CI 통과율**: > 95%
- **평균 수정 시간**: < 1일 (검증 실패 → 수정 완료)
- **보안 취약점**: 0 (high/critical)

### 주간 리포트

```
Week XX Validation Report:
- Test Coverage: 85% (↑ 2%)
- CI Success Rate: 98%
- Failed Validations: 3
  - Type errors: 1 (fixed)
  - Unit test failures: 2 (fixed)
- Security Issues: 0
- Performance: All KPIs met ✓
```

---

## 🎓 검증 예제 (Validation Examples)

### 예제 1: 새로운 MCP 툴 추가

**요구사항**: `update_note` 툴 추가

**검증 방법 정의**:
1. 타입 검증: Zod 스키마로 입력 검증
2. 단위 테스트: 노트 업데이트 로직 테스트
3. 통합 테스트: Storage + Index 업데이트 확인
4. E2E 테스트: MCP를 통한 전체 플로우 테스트
5. 성능 테스트: 업데이트 지연시간 < 100ms

**구현 순서**:
```typescript
// 1. 타입 검증 (Zod 스키마)
const UpdateNoteInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// 2. 단위 테스트 작성
describe('updateNote', () => {
  it('should update note title', async () => {
    // ... test implementation
  });
});

// 3. 구현
async function updateNote(input: unknown) {
  const validated = UpdateNoteInputSchema.parse(input);
  // ... implementation
}

// 4. 통합/E2E 테스트
// ... more tests

// 5. 검증 실행 및 통과 확인
```

---

## 📚 관련 문서

- [GOALS.md](./GOALS.md) - 검증이 #1 목표임을 명시
- [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md) - TDD 워크플로우
- [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) - 성능/보안 KPI

---

## 📊 실제 커버리지 현황 (v0.0.2)

### 전체 커버리지
```
전체 코드: 45.95% statements, 27.7% branches (목표: 60%+)
핵심 기능: 84.96% statements, 74.28% branches ✅
```

### 패키지별 커버리지
| 패키지 | Statements | Status | 주요 갭 |
|-------|-----------|--------|---------|
| **mcp-server/src/tools** | 84.96% | ✅ 우수 | 핵심 기능 잘 검증됨 |
| **common/src** | 65.14% | ⚠️ 개선 필요 | 보안 함수 테스트 추가됨 (v0.0.2) |
| **index-search/src** | 47.59% | ⚠️ 개선 필요 | link-graph 21.52% |
| **storage-md/src** | 46.95% | ⚠️ 개선 필요 | watcher 13.79% |
| **assoc-engine/src** | 0% | ❌ 미구현 | Epic E4 (Olima) |

### 검증 완료된 기능 (v0.0.2+)
- ✅ **보안 검증**: 민감정보 마스킹 (21개 테스트)
- ✅ **데이터 무결성**: 원자적 쓰기 (15개 테스트)
- ✅ **MCP 프로토콜**: E2E 테스트 (13개 테스트)
- ✅ **성능**: P95 < 1ms (목표 120ms 대비 120배 초과)

### CI 강제 수준
```javascript
// jest.config.js (v0.0.2+)
coverageThreshold: {
  global: {
    statements: 45,    // 기존: 30 → 신규: 45 (↑50%)
    functions: 40,     // 기존: 25 → 신규: 40 (↑60%)
    lines: 45,         // 기존: 30 → 신규: 45 (↑50%)
    branches: 27       // 기존: 25 → 신규: 27 (↑8%)
  },
  'packages/mcp-server/src/tools': {
    statements: 80,    // 핵심 기능 높은 기준 유지
    lines: 80
  }
}
```

---

## 💡 핵심 메시지

> **"검증을 어떻게 할 것인가?"**를 먼저 생각하고, 코드는 나중에 작성합니다.
>
> 검증 방법이 명확하지 않다면, 요구사항이 명확하지 않은 것입니다.
>
> **현재 상태 (v0.0.2)**: 핵심 경로는 "Validation First" 달성 ✅
> **목표 (v0.1.0)**: 전체 코드에 "No Validation, No Code" 확대 🎯
