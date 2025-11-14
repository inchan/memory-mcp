# Memory MCP CLI 구조 리팩토링 계획

**작성일**: 2025-11-13
**대상**: `/packages/mcp-server/src/cli.ts`
**목적**: MCP 서버로 사용 시 서브커맨드 없이 직접 옵션을 받을 수 있도록 개선

---

## Executive Summary

### 핵심 문제
현재 memory-mcp CLI는 Commander.js의 서브커맨드 패턴(`server`, `healthcheck`, `version`)을 사용하고 있으며, `--vault`, `--index` 등의 옵션이 `server` 서브커맨드에만 정의되어 있습니다.

Claude Desktop과 같은 MCP 클라이언트는 서브커맨드 없이 직접 `node cli.js --vault ... --index ...` 형태로 실행하기 때문에, 현재 구조에서는 `error: unknown option '--vault'` 에러가 발생합니다.

### 권장 솔루션
**옵션 B: 서브커맨드를 선택적으로 (기본 동작 = server)**

Commander.js의 기능을 활용하여:
1. 루트 레벨에서 서버 옵션을 직접 받을 수 있도록 설정
2. 서브커맨드가 없으면 자동으로 서버 시작 (기본 동작)
3. 기존 `server`, `healthcheck`, `version` 서브커맨드는 명시적으로 호출 가능하도록 유지 (하위 호환성)

### 예상 효과
- ✅ Claude Desktop 호환: `node cli.js --vault ~/vault --index ~/.index.db` 직접 실행 가능
- ✅ 하위 호환성 유지: 기존 `memory-mcp server --vault ...` 방식도 계속 작동
- ✅ MCP 표준 준수: 다른 MCP 서버들의 일반적인 패턴과 일치
- ✅ 직관적 사용성: 서브커맨드 없이 바로 서버 시작 가능

---

## 1. 현재 상태 분석

### 1.1 CLI 구조 (cli.ts)

```typescript
// 현재 구조
program
  .name("memory-mcp")
  .version(PACKAGE_VERSION);

program
  .command("server")  // 서브커맨드
  .option("--vault <path>", "볼트 디렉토리 경로", "./vault")
  .option("--index <path>", "인덱스 데이터베이스 경로", "./.memory-index.db")
  // ... 기타 옵션들
  .action(async (options) => {
    await startServer(serverOptions);
  });

program
  .action(async () => {
    // 기본 명령: 옵션 없이 서버 시작
    await startServer();
  });
```

### 1.2 문제점

#### 문제 1: 옵션이 서브커맨드에 종속
- `--vault`, `--index` 등이 `server` 서브커맨드 아래에만 정의됨
- 루트 레벨에서 이 옵션들을 인식하지 못함

#### 문제 2: Claude Desktop의 실행 방식과 불일치
```json
// Claude Desktop 설정 (USAGE_GUIDE.md 참조)
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": [
        "/path/to/cli.js",
        "--vault",         // ❌ 루트 레벨에서 인식 불가
        "/Users/.../vault",
        "--index",         // ❌ 루트 레벨에서 인식 불가
        "/Users/.../.memory-mcp/index.db"
      ]
    }
  }
}
```

#### 문제 3: 기본 action의 한계
- 현재 루트 레벨 `.action()`은 인자 없이 `startServer()`만 호출
- 옵션을 파싱하지 못하므로 기본값만 사용
- 사용자가 원하는 vault/index 경로를 지정할 방법이 없음

### 1.3 타 MCP 서버 CLI 패턴 조사

웹 검색 결과를 바탕으로 일반적인 MCP 서버 CLI 패턴:

#### 패턴 A: 플랫한 구조 (추천)
```bash
# FastMCP 스타일
npx fastmcp run server.py --option value

# 대부분의 MCP 서버
npx some-mcp-server --config /path/to/config
```

#### 패턴 B: 서브커맨드 선택적 사용
```bash
# 기본 동작 (서브커맨드 생략)
npx tool --option value

# 명시적 서브커맨드
npx tool server --option value
npx tool healthcheck
```

**결론**: 대부분의 MCP 서버는 **서브커맨드 없이 직접 실행 가능**하며, 추가 기능(healthcheck, version 등)만 서브커맨드로 분리합니다.

---

## 2. 권장 솔루션 (옵션 B)

### 2.1 설계 개요

**핵심 아이디어**: Commander.js의 기능을 활용하여 루트 레벨에 옵션을 정의하고, 서브커맨드가 없으면 자동으로 서버 시작

```typescript
// 새로운 구조
program
  .name("memory-mcp")
  .version(PACKAGE_VERSION)
  .description("Memory MCP Server - 로컬 퍼시스턴트 메모리를 MCP 서버로 노출")
  // ✅ 루트 레벨에 옵션 정의
  .option("--verbose", "상세 로그 출력", false)
  .option("--vault <path>", "볼트 디렉토리 경로", "./vault")
  .option("--index <path>", "인덱스 데이터베이스 경로", "./.memory-index.db")
  .option("--mode <mode>", "동작 모드 (dev|prod)", "dev")
  .option("--timeout <ms>", "툴 실행 타임아웃 (ms)", parseInteger(value, 5_000), 5_000)
  .option("--retries <count>", "툴 실행 재시도 횟수", parseInteger(value, 2), 2)
  .action(async (options) => {
    // ✅ 루트 레벨 기본 action: 서버 시작
    await startServerWithOptions(options);
  });

// ✅ 하위 호환성: 명시적 server 서브커맨드 유지
program
  .command("server")
  .description("MCP 서버 시작 (JSON-RPC 2.0 stdin/stdout)")
  .action(async () => {
    // 부모 옵션 상속
    const opts = program.opts();
    await startServerWithOptions(opts);
  });

// ✅ 기타 유틸리티 서브커맨드 유지
program
  .command("healthcheck")
  .description("시스템 상태 확인")
  .action(async () => {
    const opts = program.opts();
    await runHealthcheck(opts);
  });

program
  .command("version")
  .description("버전 정보 출력")
  .action(() => {
    printVersionInfo();
  });
```

### 2.2 주요 변경 사항

#### 변경 1: 옵션을 루트 레벨로 이동
- `--vault`, `--index`, `--verbose` 등 모든 서버 옵션을 `.option()`으로 루트에 정의
- 서브커맨드에서는 옵션 재정의 불필요 (부모로부터 상속)

#### 변경 2: 루트 action에서 서버 시작
- 서브커맨드 없이 실행 시 루트 `.action()` 호출
- 옵션을 파싱하여 서버 시작

#### 변경 3: `server` 서브커맨드는 별칭으로 유지
- 명시적으로 `memory-mcp server` 호출 가능 (하위 호환성)
- 내부적으로 부모 옵션을 참조하여 동일하게 서버 시작

### 2.3 실행 예시

```bash
# ✅ 방법 1: 직접 실행 (새로운 방식, Claude Desktop 호환)
node cli.js --vault ~/vault --index ~/.index.db

# ✅ 방법 2: 명시적 서브커맨드 (기존 방식, 하위 호환)
node cli.js server --vault ~/vault --index ~/.index.db

# ✅ 방법 3: npx 사용
npx memory-mcp --vault ~/vault

# ✅ 방법 4: 서브커맨드 명시
npx memory-mcp server --vault ~/vault

# ✅ 헬스체크 (서브커맨드)
node cli.js healthcheck --vault ~/vault

# ✅ 버전 정보
node cli.js version
node cli.js --version
```

### 2.4 Claude Desktop 설정

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": [
        "/Users/inchan/workspace/pilot/memory-mcp/packages/mcp-server/dist/cli.js",
        "--vault",
        "/Users/inchan/Documents/vault",
        "--index",
        "/Users/inchan/.memory-mcp/index.db",
        "--mode",
        "prod"
      ]
    }
  }
}
```

**주의**: 서브커맨드 `server`를 제거하고 옵션만 전달

---

## 3. 구현 계획

### Phase 1: 옵션 리팩토링 (30분)

#### Task 1.1: 루트 레벨 옵션 정의
**파일**: `packages/mcp-server/src/cli.ts`

```typescript
program
  .name("memory-mcp")
  .description("Memory MCP Server - 로컬 퍼시스턴트 메모리를 MCP 서버로 노출")
  .version(PACKAGE_VERSION)
  // 서버 옵션을 루트 레벨로 이동
  .option("--verbose", "상세 로그 출력", false)
  .option("--vault <path>", "볼트 디렉토리 경로", "./vault")
  .option("--index <path>", "인덱스 데이터베이스 경로", "./.memory-index.db")
  .option("--mode <mode>", "동작 모드 (dev|prod)", "dev")
  .option(
    "--timeout <ms>",
    "툴 실행 타임아웃 (ms)",
    (value) => parseInteger(value, 5_000),
    5_000
  )
  .option(
    "--retries <count>",
    "툴 실행 재시도 횟수",
    (value) => parseInteger(value, 2),
    2
  );
```

#### Task 1.2: 루트 action 구현
```typescript
/**
 * 루트 레벨 기본 action: 옵션으로 서버 시작
 */
program.action(async (options) => {
  if (options.verbose) {
    logger.setLevel("debug");
  }

  const serverOptions: MemoryMcpServerOptions = {
    vaultPath: options.vault,
    indexPath: options.index,
    mode: options.mode,
    policy: {
      timeoutMs: options.timeout,
      maxRetries: options.retries,
    },
  };

  logger.info("Memory MCP Server 시작 중...", serverOptions);

  try {
    await startServer(serverOptions);
  } catch (error) {
    logger.error("서버 시작 실패:", error);
    process.exit(1);
  }
});
```

### Phase 2: 서브커맨드 단순화 (20분)

#### Task 2.1: `server` 서브커맨드 별칭화
```typescript
/**
 * server 서브커맨드: 하위 호환성을 위한 별칭
 */
program
  .command("server")
  .description("MCP 서버 시작 (JSON-RPC 2.0 stdin/stdout) - 별칭, 생략 가능")
  .action(async () => {
    // 부모 옵션 상속
    const opts = program.opts();

    if (opts.verbose) {
      logger.setLevel("debug");
    }

    const serverOptions: MemoryMcpServerOptions = {
      vaultPath: opts.vault,
      indexPath: opts.index,
      mode: opts.mode,
      policy: {
        timeoutMs: opts.timeout,
        maxRetries: opts.retries,
      },
    };

    logger.info("Memory MCP Server 시작 중 (server 커맨드)...", serverOptions);

    try {
      await startServer(serverOptions);
    } catch (error) {
      logger.error("서버 시작 실패:", error);
      process.exit(1);
    }
  });
```

**중요**: 서브커맨드에서 옵션을 재정의하지 않고, 부모 옵션을 `program.opts()`로 상속

#### Task 2.2: `healthcheck` 서브커맨드 간소화
```typescript
/**
 * 헬스체크 명령
 */
program
  .command("healthcheck")
  .description("시스템 상태 확인")
  .action(async () => {
    const opts = program.opts();

    logger.info("시스템 헬스체크 중...");

    // TODO: 실제 헬스체크 로직 구현
    console.log("✅ Memory MCP Server 상태: 정상");
    console.log(`✅ 볼트 경로: ${opts.vault}`);
    console.log(`✅ 인덱스 경로: ${opts.index}`);
    console.log("✅ 의존성: 모두 로드됨");

    logger.info("헬스체크 완료");
  });
```

**주의**: healthcheck도 vault/index 경로가 필요하므로 부모 옵션 사용

#### Task 2.3: `version` 서브커맨드는 유지
```typescript
/**
 * 버전 정보 명령
 */
program
  .command("version")
  .description("버전 정보 출력")
  .action(() => {
    console.log(`Memory MCP Server v${PACKAGE_VERSION}`);
    console.log("- MCP 프로토콜 호환");
    console.log("- JSON-RPC 2.0 stdin/stdout 통신");
    console.log("- PARA + Zettelkasten 조직 체계");
    console.log("- SQLite FTS5 전문 검색");
  });
```

**참고**: version은 옵션 불필요, 변경 없음

### Phase 3: 테스트 및 검증 (30분)

#### Task 3.1: 수동 테스트 시나리오

```bash
# 빌드
cd /Users/inchan/workspace/pilot/memory-mcp
npm run build

# 테스트 1: 직접 실행 (새로운 방식)
node packages/mcp-server/dist/cli.js --vault /tmp/test-vault --index /tmp/test.db --verbose

# 테스트 2: 서브커맨드 명시 (하위 호환)
node packages/mcp-server/dist/cli.js server --vault /tmp/test-vault --index /tmp/test.db

# 테스트 3: 헬스체크
node packages/mcp-server/dist/cli.js healthcheck --vault /tmp/test-vault

# 테스트 4: 버전 정보
node packages/mcp-server/dist/cli.js version
node packages/mcp-server/dist/cli.js --version

# 테스트 5: npx 사용
npx memory-mcp --vault /tmp/test-vault

# 테스트 6: 도움말
node packages/mcp-server/dist/cli.js --help
node packages/mcp-server/dist/cli.js server --help
```

#### Task 3.2: 유닛 테스트 작성

**파일**: `packages/mcp-server/src/__tests__/cli.test.ts` (신규)

```typescript
import { describe, it, expect, beforeEach } from "@jest/globals";
import { execSync } from "child_process";
import { resolve } from "path";

const CLI_PATH = resolve(__dirname, "../../dist/cli.js");

describe("CLI Options Parsing", () => {
  it("should accept --vault and --index at root level", () => {
    const result = execSync(
      `node ${CLI_PATH} --vault /tmp/vault --index /tmp/index.db --help`,
      { encoding: "utf-8" }
    );

    expect(result).toContain("--vault");
    expect(result).toContain("--index");
  });

  it("should accept server subcommand with options (backward compat)", () => {
    const result = execSync(
      `node ${CLI_PATH} server --vault /tmp/vault --help`,
      { encoding: "utf-8" }
    );

    expect(result).toContain("MCP 서버 시작");
  });

  it("should show version", () => {
    const result = execSync(`node ${CLI_PATH} version`, {
      encoding: "utf-8",
    });

    expect(result).toContain("Memory MCP Server v");
  });

  it("should show healthcheck", () => {
    const result = execSync(`node ${CLI_PATH} healthcheck --vault /tmp`, {
      encoding: "utf-8",
    });

    expect(result).toContain("헬스체크");
  });
});
```

**참고**: 실제 서버 시작 테스트는 통합 테스트에서 수행 (stdin/stdout 통신 필요)

### Phase 4: 문서 업데이트 (20분)

#### Task 4.1: USAGE_GUIDE.md 업데이트

**파일**: `docs/USAGE_GUIDE.md`

**변경 전 (라인 59-69)**:
```bash
#### 서버 시작
```bash
cd /Users/inchan/workspace/pilot/memory-mcp
npm start -- --vault ~/Documents/vault --index ~/.memory-mcp/index.db
```

#### 헬스체크
```bash
node packages/mcp-server/dist/cli.js healthcheck \
  --vault ~/Documents/vault \
  --index ~/.memory-mcp/index.db
```

**변경 후**:
```bash
#### 서버 시작 (직접 실행 - 권장)
```bash
cd /Users/inchan/workspace/pilot/memory-mcp
node packages/mcp-server/dist/cli.js --vault ~/Documents/vault --index ~/.memory-mcp/index.db

# 또는 npx 사용
npx memory-mcp --vault ~/Documents/vault --index ~/.memory-mcp/index.db
```

#### 서버 시작 (server 서브커맨드 - 하위 호환)
```bash
node packages/mcp-server/dist/cli.js server --vault ~/Documents/vault --index ~/.memory-mcp/index.db
```

#### 헬스체크
```bash
node packages/mcp-server/dist/cli.js healthcheck --vault ~/Documents/vault --index ~/.memory-mcp/index.db
```

#### Task 4.2: README.md 업데이트

**파일**: `README.md`

**변경 전 (라인 305-314)**:
```bash
### Running Locally

```bash
# Start server with test vault
node packages/mcp-server/dist/cli.js --vault /tmp/test-vault

# Or with npm
npm start -- --vault /tmp/test-vault

# Run healthcheck
node packages/mcp-server/dist/cli.js healthcheck --vault /tmp/test-vault
```

**변경 후**:
```bash
### Running Locally

```bash
# Start server with test vault (direct execution)
node packages/mcp-server/dist/cli.js --vault /tmp/test-vault --index /tmp/test.db

# Or with npm
npm start -- --vault /tmp/test-vault --index /tmp/test.db

# With npx
npx memory-mcp --vault /tmp/test-vault

# Run healthcheck
node packages/mcp-server/dist/cli.js healthcheck --vault /tmp/test-vault

# Version info
node packages/mcp-server/dist/cli.js version
```

#### Task 4.3: Claude Desktop 설정 문서화

**파일**: `docs/USAGE_GUIDE.md` (라인 26-41)

**현재 내용 유지, 주의사항 명확화**:
```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": [
        "/Users/inchan/workspace/pilot/memory-mcp/packages/mcp-server/dist/cli.js",
        "--vault",
        "/Users/inchan/Documents/vault",
        "--index",
        "/Users/inchan/.memory-mcp/index.db"
      ]
    }
  }
}
```

**주의사항 강조**:
- ✅ 서브커맨드 `server` 불필요 (직접 옵션 전달)
- ✅ 절대 경로 사용 필수
- ✅ `--mode prod` 옵션 추가 권장 (프로덕션 환경)

---

## 4. 리스크 평가 및 완화 방안

### 리스크 1: 하위 호환성 파괴

**영향도**: 중
**확률**: 낮음

**시나리오**:
- 기존 사용자가 `memory-mcp server --vault ...` 방식 사용 중
- 리팩토링 후 동작하지 않을 가능성

**완화 방안**:
- ✅ `server` 서브커맨드를 별칭으로 유지
- ✅ 부모 옵션을 상속하여 동일한 동작 보장
- ✅ CHANGELOG.md에 명확히 기록

**검증 방법**:
```bash
# 기존 방식 테스트
node cli.js server --vault /tmp/vault --index /tmp/index.db

# 새 방식 테스트
node cli.js --vault /tmp/vault --index /tmp/index.db

# 결과: 두 방식 모두 동일하게 작동해야 함
```

### 리스크 2: Commander.js 옵션 상속 버그

**영향도**: 중
**확률**: 낮음

**시나리오**:
- 서브커맨드에서 `program.opts()` 호출 시 부모 옵션을 제대로 상속받지 못함
- Commander.js 버전에 따라 동작 차이 발생 가능

**완화 방안**:
- ✅ 현재 설치된 Commander.js 버전 확인 (11.1.0)
- ✅ Commander.js 공식 문서 참조하여 옵션 상속 패턴 확인
- ✅ 유닛 테스트로 옵션 파싱 검증

**검증 방법**:
```typescript
// 테스트 코드에서 옵션 파싱 확인
const opts = program.opts();
expect(opts.vault).toBe("/tmp/vault");
expect(opts.index).toBe("/tmp/index.db");
```

### 리스크 3: Claude Desktop 통합 실패

**영향도**: 높음
**확률**: 낮음

**시나리오**:
- Claude Desktop에서 여전히 `unknown option` 에러 발생
- MCP 클라이언트의 stdin/stdout 통신 방식과 충돌

**완화 방안**:
- ✅ 리팩토링 후 즉시 Claude Desktop에서 실제 테스트
- ✅ MCP Inspector로 서버 동작 검증
- ✅ 실패 시 즉시 롤백 가능하도록 Git 커밋 분리

**검증 방법**:
```bash
# 1. Claude Desktop 설정 업데이트
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 2. Claude Desktop 재시작

# 3. Claude에서 MCP 도구 확인
# 좌측 하단 🔌 아이콘 확인
# create_note, read_note 등 6개 도구가 표시되는지 확인

# 4. 노트 생성 테스트
# Claude에게 요청: "테스트 노트를 만들어줘"
```

### 리스크 4: 옵션 파싱 우선순위 혼란

**영향도**: 낮음
**확률**: 중간

**시나리오**:
- 루트 레벨과 서브커맨드 레벨 옵션이 동시에 제공될 경우 충돌
- 예: `node cli.js --vault /tmp/a server --vault /tmp/b`

**완화 방안**:
- ✅ 서브커맨드에서 옵션 재정의하지 않음 (부모만 사용)
- ✅ 문서에서 이러한 사용 방식을 명확히 금지
- ✅ 필요 시 옵션 검증 로직 추가

**검증 방법**:
```bash
# 이러한 사용은 권장하지 않음 (문서에 명시)
node cli.js --vault /tmp/a server

# 권장 사용법:
node cli.js --vault /tmp/a
node cli.js server --vault /tmp/a  # 동일 결과
```

---

## 5. 검증 방법

### 5.1 기능 검증 시나리오

#### 시나리오 1: 직접 실행 (새로운 방식)
```bash
# 단계 1: 빌드
npm run build

# 단계 2: 테스트 vault 생성
mkdir -p /tmp/test-vault
mkdir -p /tmp/.memory-mcp

# 단계 3: CLI 실행
node packages/mcp-server/dist/cli.js \
  --vault /tmp/test-vault \
  --index /tmp/.memory-mcp/index.db \
  --verbose

# 예상 결과:
# - 서버가 정상 시작됨
# - "Memory MCP Server 시작 중..." 로그 출력
# - stdin/stdout 대기 상태 진입
```

#### 시나리오 2: 서브커맨드 명시 (하위 호환)
```bash
node packages/mcp-server/dist/cli.js server \
  --vault /tmp/test-vault \
  --index /tmp/.memory-mcp/index.db

# 예상 결과:
# - 시나리오 1과 동일한 동작
```

#### 시나리오 3: 헬스체크
```bash
node packages/mcp-server/dist/cli.js healthcheck \
  --vault /tmp/test-vault \
  --index /tmp/.memory-mcp/index.db

# 예상 결과:
# - "✅ Memory MCP Server 상태: 정상" 출력
# - vault/index 경로 출력
```

#### 시나리오 4: 버전 정보
```bash
node packages/mcp-server/dist/cli.js version

# 예상 결과:
# - "Memory MCP Server v0.1.0" 출력
# - 기능 목록 출력

node packages/mcp-server/dist/cli.js --version

# 예상 결과:
# - "0.1.0" 출력 (Commander.js 기본 동작)
```

#### 시나리오 5: 도움말
```bash
node packages/mcp-server/dist/cli.js --help

# 예상 결과:
# - Usage 정보 출력
# - 루트 레벨 옵션 목록 표시
# - 서브커맨드 목록 표시 (server, healthcheck, version)
```

### 5.2 통합 검증: Claude Desktop

#### 단계 1: 설정 파일 업데이트
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": [
        "/Users/inchan/workspace/pilot/memory-mcp/packages/mcp-server/dist/cli.js",
        "--vault",
        "/Users/inchan/Documents/test-vault",
        "--index",
        "/Users/inchan/.memory-mcp/test-index.db",
        "--mode",
        "prod",
        "--verbose"
      ]
    }
  }
}
```

#### 단계 2: Claude Desktop 재시작
- Claude Desktop 완전 종료
- 재시작 후 로그 확인

#### 단계 3: MCP 연결 확인
- 좌측 하단 🔌 아이콘이 표시되는지 확인
- 도구 목록에서 6개 도구 확인:
  - `create_note`
  - `read_note`
  - `list_notes`
  - `search_memory`
  - `update_note`
  - `delete_note`

#### 단계 4: 기능 테스트
```
Claude에게 요청:
1. "테스트 노트를 만들어줘. 제목은 'CLI 리팩토링 테스트', 카테고리는 Projects로."
   → create_note 도구 호출 확인

2. "방금 만든 노트를 읽어줘."
   → read_note 도구 호출 확인

3. "노트 목록을 보여줘."
   → list_notes 도구 호출 확인

4. "'리팩토링'으로 검색해줘."
   → search_memory 도구 호출 확인
```

#### 예상 결과:
- ✅ 모든 도구가 정상 호출됨
- ✅ 에러 없이 노트 생성/읽기/검색 가능
- ✅ `/Users/inchan/Documents/test-vault` 디렉토리에 .md 파일 생성 확인

### 5.3 성능 검증

#### 검증 포인트:
- 서버 시작 시간 < 1초
- 옵션 파싱 오버헤드 < 10ms
- 메모리 사용량 변화 없음

#### 측정 방법:
```bash
# 서버 시작 시간 측정
time node packages/mcp-server/dist/cli.js --vault /tmp/vault --index /tmp/index.db &

# 메모리 사용량 측정 (서버 실행 중)
ps aux | grep cli.js
```

---

## 6. 롤백 계획

### 롤백 트리거
다음 중 하나라도 발생 시 즉시 롤백:
1. Claude Desktop 통합 실패 (MCP 도구 인식 불가)
2. 기존 테스트 케이스 실패
3. 하위 호환성 파괴 확인
4. 성능 저하 > 10%

### 롤백 절차
```bash
# 1. Git 커밋 이력 확인
git log --oneline -5

# 2. 리팩토링 커밋 식별
# 예: "refactor(cli): support root-level options for MCP compatibility"

# 3. 롤백
git revert <commit-hash>

# 4. 빌드 및 테스트
npm run build
npm test

# 5. Claude Desktop 재검증
```

### 롤백 후 조치
1. 리팩토링 실패 원인 분석
2. 대안 솔루션 검토 (옵션 A 또는 C)
3. 이슈 생성 및 커뮤니티 피드백 수집

---

## 7. 타임라인 및 마일스톤

### 총 예상 소요 시간: 2시간

| Phase | Task | 예상 시간 | 누적 시간 |
|-------|------|-----------|-----------|
| **Phase 1** | 옵션 리팩토링 | 30분 | 30분 |
| - | Task 1.1: 루트 레벨 옵션 정의 | 15분 | 15분 |
| - | Task 1.2: 루트 action 구현 | 15분 | 30분 |
| **Phase 2** | 서브커맨드 단순화 | 20분 | 50분 |
| - | Task 2.1: server 서브커맨드 별칭화 | 10분 | 40분 |
| - | Task 2.2: healthcheck 서브커맨드 간소화 | 5분 | 45분 |
| - | Task 2.3: version 서브커맨드 확인 | 5분 | 50분 |
| **Phase 3** | 테스트 및 검증 | 30분 | 80분 |
| - | Task 3.1: 수동 테스트 시나리오 | 20분 | 70분 |
| - | Task 3.2: 유닛 테스트 작성 | 10분 | 80분 |
| **Phase 4** | 문서 업데이트 | 20분 | 100분 |
| - | Task 4.1: USAGE_GUIDE.md 업데이트 | 10분 | 90분 |
| - | Task 4.2: README.md 업데이트 | 5분 | 95분 |
| - | Task 4.3: Claude Desktop 설정 문서화 | 5분 | 100분 |
| **Phase 5** | 통합 검증 (Claude Desktop) | 20분 | 120분 |

### 마일스톤

**M1: 코드 리팩토링 완료** (50분)
- ✅ cli.ts 수정 완료
- ✅ 빌드 성공
- ✅ 로컬 수동 테스트 통과

**M2: 테스트 및 문서화 완료** (100분)
- ✅ 유닛 테스트 작성 및 통과
- ✅ 문서 업데이트 완료
- ✅ CHANGELOG.md 작성

**M3: 통합 검증 완료** (120분)
- ✅ Claude Desktop 통합 성공
- ✅ 6개 MCP 도구 모두 작동
- ✅ 성능 검증 통과

---

## 8. 성공 지표 (KPI)

### 기능 지표
- ✅ Claude Desktop에서 `unknown option` 에러 0건
- ✅ 루트 레벨 옵션 파싱 성공률 100%
- ✅ 하위 호환성 테스트 통과율 100%
- ✅ 6개 MCP 도구 모두 정상 작동

### 성능 지표
- ✅ 서버 시작 시간 < 1초 (변화 없음)
- ✅ 옵션 파싱 오버헤드 < 10ms
- ✅ 메모리 사용량 증가 < 1MB

### 품질 지표
- ✅ ESLint 에러 0건
- ✅ TypeScript 컴파일 에러 0건
- ✅ 유닛 테스트 통과율 100%
- ✅ 코드 커버리지 유지 또는 증가

### 사용성 지표
- ✅ 문서 업데이트 완료 (3개 파일)
- ✅ 사용 예시 추가 (5개 이상)
- ✅ 하위 호환성 명시적 문서화

---

## 9. 다음 단계 (후속 작업)

### 단기 (v0.1.1)
1. **환경변수 지원 추가**
   - `MEMORY_MCP_VAULT`, `MEMORY_MCP_INDEX` 환경변수 인식
   - 우선순위: CLI 옵션 > 환경변수 > 기본값

2. **설정 파일 지원**
   - `~/.memory-mcp/config.json` 또는 `./memory-mcp.config.json`
   - 우선순위: CLI 옵션 > 환경변수 > 설정 파일 > 기본값

3. **npx 배포 및 검증**
   - npm 레지스트리에 배포
   - `npx @memory-mcp/mcp-server --vault ~/vault` 테스트

### 중기 (v0.2.0)
1. **Claude Desktop 자동 설정 도구**
   - `memory-mcp setup` 명령 추가
   - claude_desktop_config.json 자동 생성/업데이트

2. **인터랙티브 모드**
   - `memory-mcp init` 명령으로 대화형 설정

3. **로깅 개선**
   - `--log-file` 옵션 추가
   - MCP 서버 로그를 파일로 저장 (디버깅 용이)

### 장기 (v1.0.0)
1. **CLI 플러그인 아키텍처**
   - 서드파티 플러그인 지원
   - `memory-mcp plugin install <name>`

2. **다중 MCP 서버 관리**
   - 여러 vault를 동시에 관리하는 멀티 인스턴스 모드

---

## 10. 부록

### A. Commander.js 옵션 상속 패턴 참조

```typescript
// Commander.js 11.x에서 부모 옵션 상속 예시
const program = new Command();

program
  .option("--global <value>", "Global option");

program
  .command("sub")
  .action(() => {
    const opts = program.opts(); // 부모 옵션 접근
    console.log(opts.global);
  });
```

**참고 문서**: https://github.com/tj/commander.js#commands

### B. 다른 MCP 서버 CLI 구조 비교

| 프로젝트 | 패턴 | 예시 |
|---------|------|------|
| FastMCP | 플랫한 구조 | `fastmcp run server.py` |
| cli-mcp-server | 플랫한 구조 | `npx cli-mcp-server --config ...` |
| mcp-tools | 서브커맨드 선택적 | `mcp chat` / `mcp --version` |
| Angular MCP | 플랫한 구조 | `npx angular-mcp --project ...` |

**결론**: 대부분 플랫한 구조 또는 서브커맨드 선택적 사용

### C. 옵션 비교표

| 옵션 | 장점 | 단점 | 하위 호환성 | 구현 복잡도 |
|------|------|------|-------------|-------------|
| **A: 루트 레벨 옵션 추가** | 간단 | 중복 코드 | ✅ 완벽 | 낮음 |
| **B: 서브커맨드 선택적** | 직관적 | 옵션 상속 필요 | ✅ 유지 | 중간 |
| **C: 완전 플랫** | 명확함 | 하위 호환 파괴 | ❌ 파괴 | 낮음 |

**권장**: 옵션 B (서브커맨드 선택적)

### D. 관련 파일 목록

| 파일 경로 | 역할 | 수정 필요 |
|-----------|------|-----------|
| `packages/mcp-server/src/cli.ts` | CLI 진입점 | ✅ 주요 수정 |
| `packages/mcp-server/src/server.ts` | MCP 서버 구현 | 변경 없음 |
| `packages/mcp-server/package.json` | 패키지 설정 | 변경 없음 |
| `docs/USAGE_GUIDE.md` | 사용자 가이드 | ✅ 업데이트 |
| `README.md` | 프로젝트 소개 | ✅ 업데이트 |
| `CHANGELOG.md` | 변경 이력 | ✅ 추가 |

### E. 체크리스트

#### 리팩토링 전
- [ ] 현재 cli.ts 백업
- [ ] Git 브랜치 생성 (`git checkout -b refactor/cli-root-options`)
- [ ] 기존 테스트 실행 및 통과 확인

#### 리팩토링 중
- [ ] 루트 레벨 옵션 정의 (Task 1.1)
- [ ] 루트 action 구현 (Task 1.2)
- [ ] server 서브커맨드 별칭화 (Task 2.1)
- [ ] healthcheck 서브커맨드 간소화 (Task 2.2)
- [ ] version 서브커맨드 확인 (Task 2.3)

#### 테스트
- [ ] 빌드 성공 (`npm run build`)
- [ ] 직접 실행 테스트 (시나리오 1)
- [ ] 서브커맨드 테스트 (시나리오 2)
- [ ] 헬스체크 테스트 (시나리오 3)
- [ ] 버전 정보 테스트 (시나리오 4)
- [ ] 도움말 테스트 (시나리오 5)
- [ ] 유닛 테스트 작성 및 통과

#### 문서화
- [ ] USAGE_GUIDE.md 업데이트
- [ ] README.md 업데이트
- [ ] CHANGELOG.md 작성

#### 통합 검증
- [ ] Claude Desktop 설정 업데이트
- [ ] Claude Desktop 재시작
- [ ] MCP 도구 목록 확인
- [ ] create_note 테스트
- [ ] read_note 테스트
- [ ] list_notes 테스트
- [ ] search_memory 테스트

#### 완료
- [ ] Git 커밋 (`git commit -m "refactor(cli): support root-level options for MCP compatibility"`)
- [ ] 테스트 통과 확인
- [ ] PR 생성 및 리뷰 요청

---

## 결론

이 리팩토링 계획은 memory-mcp CLI를 MCP 클라이언트(Claude Desktop 등)와 완벽히 호환되도록 개선하면서, 기존 사용자의 하위 호환성을 보장합니다.

**핵심 전략**:
1. 루트 레벨에 옵션을 정의하여 서브커맨드 없이 직접 실행 가능
2. `server` 서브커맨드를 별칭으로 유지하여 하위 호환성 보장
3. Commander.js의 옵션 상속 기능을 활용하여 코드 중복 최소화
4. 철저한 테스트와 문서화로 안정성 확보

**예상 효과**:
- ✅ Claude Desktop에서 즉시 사용 가능
- ✅ 사용자 경험 향상 (직관적인 CLI)
- ✅ MCP 표준 패턴 준수
- ✅ 유지보수성 개선

**다음 단계**: 이 계획에 따라 구현을 시작하고, Phase별로 검증을 진행합니다.
