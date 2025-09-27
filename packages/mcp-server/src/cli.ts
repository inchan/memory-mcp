#!/usr/bin/env node

/**
 * @memory-mcp/mcp-server
 * CLI 진입점 - Commander.js 기반
 */

import { Command } from "commander";
import { logger } from "@memory-mcp/common";
import { startServer, type MemoryMcpServerOptions } from "./server.js";
import { PACKAGE_VERSION } from "./version.js";
import * as fs from "fs/promises";
import * as path from "path";

const program = new Command();

function parseInteger(value: string, defaultValue: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

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

    let hasErrors = false;
    const results: Array<{ status: "✅" | "❌"; message: string }> = [];

    try {
      // 1. 볼트 디렉토리 검증
      const vaultPath = path.resolve(options.vault);
      try {
        const vaultStat = await fs.stat(vaultPath);
        if (vaultStat.isDirectory()) {
          results.push({ status: "✅", message: `볼트 경로: ${vaultPath}` });

          // PARA 디렉토리 구조 검증
          const paraCategories = ["Projects", "Areas", "Resources", "Archives"];
          for (const category of paraCategories) {
            const categoryPath = path.join(vaultPath, category);
            try {
              await fs.access(categoryPath);
              results.push({ status: "✅", message: `PARA 카테고리: ${category}` });
            } catch {
              results.push({ status: "❌", message: `PARA 카테고리 누락: ${category}` });
              hasErrors = true;
            }
          }
        } else {
          results.push({ status: "❌", message: `볼트 경로가 디렉토리가 아닙니다: ${vaultPath}` });
          hasErrors = true;
        }
      } catch (error) {
        results.push({ status: "❌", message: `볼트 경로에 액세스할 수 없습니다: ${vaultPath}` });
        hasErrors = true;
      }

      // 2. 인덱스 파일 검증
      const indexPath = path.resolve(options.index);
      try {
        await fs.access(indexPath);
        const indexStat = await fs.stat(indexPath);
        if (indexStat.isFile()) {
          results.push({ status: "✅", message: `인덱스 파일: ${indexPath} (${Math.round(indexStat.size / 1024)}KB)` });
        } else {
          results.push({ status: "❌", message: `인덱스 경로가 파일이 아닙니다: ${indexPath}` });
          hasErrors = true;
        }
      } catch (error) {
        results.push({ status: "❌", message: `인덱스 파일에 액세스할 수 없습니다: ${indexPath} (새로 생성될 예정)` });
        // 인덱스 파일이 없는 것은 경고이지 에러는 아님
      }

      // 3. 의존성 검증
      try {
        await import("@memory-mcp/storage-md");
        await import("@memory-mcp/index-search");
        await import("@memory-mcp/assoc-engine");
        results.push({ status: "✅", message: "의존성: 모든 패키지 로드 완료" });
      } catch (error) {
        results.push({ status: "❌", message: `의존성 로드 실패: ${error instanceof Error ? error.message : String(error)}` });
        hasErrors = true;
      }

      // 4. 권한 검증
      try {
        const testFile = path.join(vaultPath, ".healthcheck-test");
        await fs.writeFile(testFile, "test");
        await fs.unlink(testFile);
        results.push({ status: "✅", message: "파일 시스템 권한: 읽기/쓰기 가능" });
      } catch (error) {
        results.push({ status: "❌", message: "파일 시스템 권한: 쓰기 권한 없음" });
        hasErrors = true;
      }

      // 결과 출력
      console.log("\n=== Memory MCP Server 헬스체크 결과 ===");
      for (const result of results) {
        console.log(`${result.status} ${result.message}`);
      }

      if (hasErrors) {
        console.log("\n❌ 일부 검증에 실패했습니다. 위 내용을 확인해주세요.");
        logger.error("헬스체크 실패");
        process.exit(1);
      } else {
        console.log("\n✅ 모든 검증이 완료되었습니다. Memory MCP Server를 사용할 준비가 되었습니다.");
        logger.info("헬스체크 완료");
      }

    } catch (error) {
      logger.error("헬스체크 중 예기치 못한 오류 발생", { error: error instanceof Error ? error.message : String(error) });
      console.log("❌ 헬스체크 중 예기치 못한 오류가 발생했습니다.");
      process.exit(1);
    }
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
