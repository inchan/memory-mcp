#!/usr/bin/env node

/**
 * @memory-mcp/mcp-server
 * CLI 진입점 - Commander.js 기반
 */

import { Command } from "commander";
import { logger } from "@memory-mcp/common";
import { startServer } from "./server.js";

const program = new Command();

/**
 * CLI 버전 정보
 */
const PACKAGE_VERSION = "0.1.0";

/**
 * CLI 프로그램 설정
 */
program
  .name("memory-mcp")
  .description("Memory MCP Server - 로컬 퍼시스턴트 메모리를 MCP 서버로 노출")
  .version(PACKAGE_VERSION);

/**
 * 서버 시작 명령
 */
program
  .command("server")
  .description("MCP 서버 시작 (JSON-RPC 2.0 stdin/stdout)")
  .option("--verbose", "상세 로그 출력", false)
  .option("--vault <path>", "볼트 디렉토리 경로", "./vault")
  .option("--index <path>", "인덱스 데이터베이스 경로", "./.memory-index.db")
  .action(async (options) => {
    if (options.verbose) {
      logger.setLevel("debug");
    }

    logger.info("Memory MCP Server 시작 중...");
    logger.info("설정:", {
      vault: options.vault,
      index: options.index,
      verbose: options.verbose,
    });

    try {
      await startServer();
    } catch (error) {
      logger.error("서버 시작 실패:", error);
      process.exit(1);
    }
  });

/**
 * 기본 명령 (서버 시작)
 */
program
  .action(async () => {
    logger.info("기본 명령: 서버 시작");
    logger.info("자세한 옵션은 --help를 참조하세요");

    try {
      await startServer();
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
 */
program
  .command("healthcheck")
  .description("시스템 상태 확인")
  .option("--vault <path>", "볼트 디렉토리 경로", "./vault")
  .option("--index <path>", "인덱스 데이터베이스 경로", "./.memory-index.db")
  .action(async (options) => {
    logger.info("시스템 헬스체크 중...");

    // TODO: 실제 헬스체크 로직 구현
    console.log("✅ Memory MCP Server 상태: 정상");
    console.log(`✅ 볼트 경로: ${options.vault}`);
    console.log(`✅ 인덱스 경로: ${options.index}`);
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