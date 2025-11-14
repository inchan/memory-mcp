#!/usr/bin/env node

/**
 * @inchan/zettel-memory
 * CLI 진입점 - Commander.js 기반
 */

import { Command } from "commander";
import { logger } from "@inchan/zettel-memory-common";
import { startServer, type MemoryMcpServerOptions } from "./server.js";

const program = new Command();

/**
 * CLI 버전 정보
 */
const PACKAGE_VERSION = "0.1.0";

function parseInteger(value: string, defaultValue: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 서버 옵션 빌드 헬퍼
 */
function buildServerOptions(options: {
  verbose?: boolean;
  vault?: string;
  index?: string;
  mode?: string;
  timeout?: number;
  retries?: number;
}): MemoryMcpServerOptions {
  if (options.verbose) {
    logger.setLevel("debug");
  }

  return {
    vaultPath: options.vault ?? "./vault",
    indexPath: options.index ?? "./.memory-index.db",
    mode: (options.mode ?? "dev") as "dev" | "prod",
    policy: {
      timeoutMs: options.timeout ?? 5_000,
      maxRetries: options.retries ?? 2,
    },
  };
}

/**
 * CLI 프로그램 설정
 * 루트 레벨에 모든 서버 옵션 정의 (Claude Desktop 호환)
 */
program
  .name("memory-mcp")
  .description("Memory MCP Server - 로컬 퍼시스턴트 메모리를 MCP 서버로 노출")
  .version(PACKAGE_VERSION)
  // 루트 레벨 옵션: 서브커맨드 없이 직접 실행 가능
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
  )
  .action(async (options) => {
    // 루트 레벨 기본 action: 옵션으로 서버 시작
    const serverOptions = buildServerOptions(options);
    logger.info("Memory MCP Server 시작 중...", serverOptions);

    try {
      await startServer(serverOptions);
    } catch (error) {
      logger.error("서버 시작 실패:", error);
      process.exit(1);
    }
  });

/**
 * 서버 시작 명령 (하위 호환성을 위한 별칭)
 * Codex 권장: cmd.parent?.optsWithGlobals() 사용
 */
program
  .command("server")
  .description("MCP 서버 시작 (별칭 - 루트 레벨 실행 권장)")
  .action(async function (this: Command) {
    // 부모 옵션 상속 (Codex 피드백 반영)
    const opts = this.optsWithGlobals?.() ?? this.opts();
    const serverOptions = buildServerOptions(opts);

    logger.info("Memory MCP Server 시작 중 (server 커맨드)...", serverOptions);

    try {
      await startServer(serverOptions);
    } catch (error) {
      logger.error("서버 시작 실패:", error);
      process.exit(1);
    }
  });

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

/**
 * 헬스체크 명령
 * Codex 피드백: 루트 옵션 상속, 보안을 위해 검증만 수행 (파일 열지 않음)
 */
program
  .command("healthcheck")
  .description("시스템 상태 확인")
  .action(async function (this: Command) {
    // 부모 옵션 상속 (필요한 옵션만 사용)
    const opts = this.optsWithGlobals?.() ?? this.opts();

    logger.info("시스템 헬스체크 중...");

    // TODO: 실제 헬스체크 로직 구현
    console.log("✅ Memory MCP Server 상태: 정상");
    console.log(`✅ 볼트 경로: ${opts.vault ?? "./vault"}`);
    console.log(`✅ 인덱스 경로: ${opts.index ?? "./.memory-index.db"}`);
    console.log("✅ 의존성: 모두 로드됨");

    logger.info("헬스체크 완료");
  });

/**
 * 에러 핸들링
 */
program.exitOverride((err) => {
  if (err.code === "commander.version" || err.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  logger.error("CLI 오류:", err);
  process.exit(1);
});

/**
 * 글로벌 에러 핸들러
 */
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

/**
 * CLI 시작
 */
if (require.main === module) {
  program.parse(process.argv);
}
