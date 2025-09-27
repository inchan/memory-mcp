import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger, maskSensitiveInfo } from '@memory-mcp/common';
import { normalizePath } from './file-operations';
import type {
  FileWatchEventData,
  GitSnapshotOptions,
  GitSnapshotResult,
  GitSnapshotMode,
} from './types';
import { StorageMdError } from './types';

const execFileAsync = promisify(execFile);

interface GitCommandOptions {
  allowFailure?: boolean;
}

export class GitSnapshotManager {
  private repositoryPath: string;
  private options: Required<Omit<GitSnapshotOptions, 'metricsCollector'>> & Pick<GitSnapshotOptions, 'metricsCollector'>;
  private isInitialized = false;
  private repositoryRoot: string | null = null;
  private hasHead = false;

  constructor(repositoryPath: string, options: GitSnapshotOptions = {}) {
    this.repositoryPath = repositoryPath;
    this.options = {
      repositoryPath: options.repositoryPath ?? repositoryPath,
      mode: options.mode ?? 'commit',
      commitMessageTemplate: options.commitMessageTemplate ?? 'chore(snapshot): {count} files updated @ {timestamp}',
      tagTemplate: options.tagTemplate ?? 'snapshot-{timestamp}',
      retries: options.retries ?? 2,
      gitBinary: options.gitBinary ?? 'git',
      metricsCollector: options.metricsCollector,
    };
  }

  /**
   * Git 저장소 확인 및 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const resolvedPath = this.options.repositoryPath;

    const rootResult = await this.runGit(['rev-parse', '--show-toplevel'], { allowFailure: true }, resolvedPath);

    if (rootResult.exitCode !== 0) {
      throw new StorageMdError(
        `Git 저장소가 아님: ${resolvedPath}`,
        'GIT_SNAPSHOT_INIT_ERROR',
        resolvedPath,
        rootResult.stderr
      );
    }

    this.repositoryRoot = normalizePath(rootResult.stdout.trim());

    const headResult = await this.runGit(['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
    this.hasHead = headResult.exitCode === 0;

    logger.debug('GitSnapshotManager 초기화 완료', {
      repositoryRoot: this.repositoryRoot,
      hasHead: this.hasHead,
      mode: this.options.mode,
    });

    this.isInitialized = true;
  }

  /**
   * 파일 변경 스냅샷 생성
   */
  async createSnapshot(events: FileWatchEventData[]): Promise<GitSnapshotResult | null> {
    if (!this.isInitialized) {
      throw new StorageMdError('GitSnapshotManager가 초기화되지 않았습니다', 'GIT_SNAPSHOT_NOT_INITIALIZED', this.repositoryPath);
    }

    if (this.options.mode === 'disabled') {
      return null;
    }

    const uniqueFiles = this.collectUniqueFiles(events);

    if (uniqueFiles.length === 0) {
      return null;
    }

    const startedAt = Date.now();
    const result: GitSnapshotResult = {
      mode: this.options.mode,
      success: false,
      changedFiles: uniqueFiles,
      durationMs: 0,
    };

    try {
      await this.stageFiles(uniqueFiles);

      const stagedCount = await this.countStagedChanges();

      if (stagedCount === 0) {
        result.message = 'No staged changes to snapshot';
        result.success = true;
        return result;
      }

      const commitSha = await this.createCommit(uniqueFiles.length);
      result.commitSha = commitSha;

      if (this.options.mode === 'tag') {
        const tagName = await this.createTag(commitSha);
        result.tagName = tagName;
      }

      result.success = true;
      logger.info('Git 스냅샷 완료', {
        files: uniqueFiles.length,
        commit: commitSha,
        tag: result.tagName,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      result.errorCode = error instanceof StorageMdError ? error.code : 'GIT_SNAPSHOT_ERROR';
      await this.rollback(uniqueFiles);
      logger.error('Git 스냅샷 실패', maskSensitiveInfo(String(error)));
      throw error;
    } finally {
      result.durationMs = Date.now() - startedAt;
      this.options.metricsCollector?.(result);
    }
  }

  /**
   * 고유 파일 목록 추출
   */
  private collectUniqueFiles(events: FileWatchEventData[]): string[] {
    const seen = new Map<string, string>();

    for (const event of events) {
      const absolute = normalizePath(event.filePath);
      const relative = this.ensureRelativeToRepo(absolute);

      if (!relative) {
        continue;
      }

      seen.set(relative, relative);
    }

    return Array.from(seen.values());
  }

  /**
   * 저장소 내 상대 경로 확인
   */
  private ensureRelativeToRepo(filePath: string): string | null {
    if (!this.repositoryRoot) {
      return null;
    }

    const relative = normalizePath(path.relative(this.repositoryRoot, filePath));

    if (relative.startsWith('..')) {
      logger.warn('Git 스냅샷에서 제외된 파일 (저장소 외부)', { filePath });
      return null;
    }

    return relative;
  }

  /**
   * 파일 스테이징
   */
  private async stageFiles(files: string[]): Promise<void> {
    const run = async () => {
      await this.runGit(['add', '--', ...files]);
    };

    await this.executeWithRetry(run, 'GIT_STAGE_ERROR');
  }

  /**
   * 스테이징된 변경사항 개수 확인
   */
  private async countStagedChanges(): Promise<number> {
    const status = await this.runGit(['status', '--porcelain']);
    const lines = status.stdout
      .split('\n')
      .map(line => line.trimEnd())
      .filter(Boolean)
      .filter(line => line[0] !== '?' && line[0] !== ' ');

    return lines.length;
  }

  /**
   * 커밋 생성
   */
  private async createCommit(fileCount: number): Promise<string> {
    if (this.options.mode !== 'commit' && this.options.mode !== 'tag') {
      return '';
    }

    const message = this.renderTemplate(this.options.commitMessageTemplate, fileCount);

    await this.executeWithRetry(async () => {
      await this.runGit(['commit', '-m', message]);
    }, 'GIT_COMMIT_ERROR');

    const commit = await this.runGit(['rev-parse', 'HEAD']);
    this.hasHead = true;
    return commit.stdout.trim();
  }

  /**
   * 태그 생성
   */
  private async createTag(commitSha: string): Promise<string> {
    const tagName = this.renderTemplate(this.options.tagTemplate, undefined, commitSha);

    await this.executeWithRetry(async () => {
      await this.runGit(['tag', tagName, commitSha]);
    }, 'GIT_TAG_ERROR');

    return tagName;
  }

  /**
   * 템플릿 렌더링
   */
  private renderTemplate(template: string, count?: number, commitSha?: string): string {
    const timestamp = new Date().toISOString();
    const replacements: Record<string, string> = {
      '{timestamp}': timestamp,
      '{count}': typeof count === 'number' ? count.toString() : '0',
      '{mode}': this.options.mode,
    };

    if (commitSha) {
      replacements['{commit}'] = commitSha;
    }

    return Object.entries(replacements).reduce((acc, [token, value]) => {
      return acc.split(token).join(value);
    }, template);
  }

  /**
   * 실패 시 롤백
   */
  private async rollback(files: string[]): Promise<void> {
    if (!this.repositoryRoot) {
      return;
    }

    if (this.hasHead) {
      await this.runGit(['reset', '--mixed', 'HEAD'], { allowFailure: true });
      return;
    }

    for (const file of files) {
      await this.runGit(['rm', '--cached', '--ignore-unmatch', '--', file], { allowFailure: true });
    }
  }

  /**
   * Git 명령 실행
   */
  private async runGit(
    args: string[],
    options: GitCommandOptions = {},
    cwdOverride?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cwd = cwdOverride ?? this.repositoryRoot ?? this.options.repositoryPath ?? this.repositoryPath;

    try {
      const { stdout, stderr } = await execFileAsync(this.options.gitBinary, args, { cwd });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      if (options.allowFailure) {
        return {
          stdout: (error?.stdout ?? '').toString(),
          stderr: (error?.stderr ?? '').toString(),
          exitCode: typeof error?.code === 'number' ? error.code : 1,
        };
      }

      throw new StorageMdError(
        `Git 명령 실패: ${this.options.gitBinary} ${args.join(' ')}`,
        'GIT_COMMAND_ERROR',
        cwd,
        error
      );
    }
  }

  /**
   * 재시도 유틸리티
   */
  private async executeWithRetry(fn: () => Promise<void>, errorCode: string): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.retries) {
      try {
        await fn();
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;

        if (attempt > this.options.retries) {
          throw new StorageMdError('Git 스냅샷 작업 실패', errorCode, this.repositoryPath, lastError);
        }

        await new Promise(resolve => setTimeout(resolve, attempt * 50));
      }
    }
  }
}

