/**
 * 파일 시스템 감시 모듈 (chokidar 기반)
 */

import chokidar from 'chokidar';
import path from 'path';
import { EventEmitter } from 'events';
import { debounce, logger } from '@memory-mcp/common';
import { normalizePath } from './file-operations';
import { loadNote } from './note-manager';
import {
  VaultWatchOptions,
  FileWatchEvent,
  FileWatchEventData,
  FileWatchHandler,
  StorageMdError
} from './types';
import { GitSnapshotManager } from './git-snapshot';

/**
 * 볼트 파일 감시자 클래스
 */
export class VaultWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private vaultPath: string;
  private options: Required<Omit<VaultWatchOptions, 'gitSnapshot'>> & Pick<VaultWatchOptions, 'gitSnapshot'>;
  private isWatching: boolean = false;
  private debouncedHandlers: Map<string, Function> = new Map();

  constructor(vaultPath: string, options: VaultWatchOptions = {}) {
    super();

    this.vaultPath = normalizePath(vaultPath);
    this.options = {
      pattern: options.pattern || '**/*.md',
      ignored: options.ignored || [
        '**/node_modules/**',
        '**/.git/**',
        '**/.*',
        '**/*.tmp',
        '**/*.temp'
      ],
      debounceMs: options.debounceMs || 300,
      recursive: options.recursive !== false,
      gitSnapshot: options.gitSnapshot,
    };

    logger.debug('VaultWatcher 생성', {
      vaultPath: this.vaultPath,
      options: this.options
    });
  }

  /**
   * 파일 감시 시작
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      logger.warn('이미 감시 중인 볼트입니다');
      return;
    }

    try {
      logger.debug(`볼트 감시 시작: ${this.vaultPath}`);

      // chokidar 설정
      const watchOptions: chokidar.WatchOptions = {
        ignored: this.options.ignored,
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      };

      if (!this.options.recursive) {
        watchOptions.depth = 1;
      }

      this.watcher = chokidar.watch(this.vaultPath, watchOptions);

      // 이벤트 핸들러 등록
      this.watcher
        .on('add', (filePath) => this.handleFileEvent('add', filePath))
        .on('change', (filePath) => this.handleFileEvent('change', filePath))
        .on('unlink', (filePath) => this.handleFileEvent('unlink', filePath))
        .on('error', (error) => this.handleError(error))
        .on('ready', () => {
          this.isWatching = true;
          logger.info(`볼트 감시 준비 완료: ${this.vaultPath}`);
          this.emit('ready');
        });

      // 초기 준비 대기
      await new Promise<void>((resolve, reject) => {
        if (this.watcher) {
          this.watcher.once('ready', resolve);
          this.watcher.once('error', reject);
        } else {
          reject(new Error('Watcher initialization failed'));
        }
      });

    } catch (error) {
      this.isWatching = false;
      throw new StorageMdError(
        `볼트 감시 시작 실패: ${this.vaultPath}`,
        'WATCHER_START_ERROR',
        this.vaultPath,
        error
      );
    }
  }

  /**
   * 파일 감시 중지
   */
  async stop(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      logger.debug(`볼트 감시 중지: ${this.vaultPath}`);

      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      this.debouncedHandlers.clear();

      logger.info(`볼트 감시 중지 완료: ${this.vaultPath}`);
      this.emit('stopped');

    } catch (error) {
      throw new StorageMdError(
        `볼트 감시 중지 실패: ${this.vaultPath}`,
        'WATCHER_STOP_ERROR',
        this.vaultPath,
        error
      );
    }
  }

  /**
   * 감시 상태 확인
   */
  get watching(): boolean {
    return this.isWatching;
  }

  /**
   * 감시 중인 파일 수 조회
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return [];
    }

    const watched = this.watcher.getWatched();
    const paths: string[] = [];

    for (const [dir, files] of Object.entries(watched)) {
      for (const file of files) {
        paths.push(normalizePath(path.join(dir, file)));
      }
    }

    return paths;
  }

  /**
   * 파일 이벤트 처리
   */
  private handleFileEvent(eventType: FileWatchEvent, filePath: string): void {
    const normalizedPath = normalizePath(filePath);

    // 마크다운 파일만 처리
    if (!this.isMarkdownFile(normalizedPath)) {
      return;
    }

    // 무시 패턴 체크
    if (this.shouldIgnorePath(normalizedPath)) {
      return;
    }

    logger.debug(`파일 이벤트: ${eventType} ${normalizedPath}`);

    // 디바운싱 적용
    const handlerKey = `${eventType}:${normalizedPath}`;

    // 기존 디바운스된 핸들러가 있으면 취소
    const existingHandler = this.debouncedHandlers.get(handlerKey);
    if (existingHandler) {
      (existingHandler as any).cancel?.();
    }

    // 새 디바운스된 핸들러 생성
    const debouncedHandler = debounce(
      () => this.processFileEvent(eventType, normalizedPath),
      this.options.debounceMs
    );

    this.debouncedHandlers.set(handlerKey, debouncedHandler);
    debouncedHandler();
  }

  /**
   * 실제 파일 이벤트 처리
   */
  private async processFileEvent(eventType: FileWatchEvent, filePath: string): Promise<void> {
    try {
      const eventData: FileWatchEventData = {
        type: eventType,
        filePath,
      };

      // 파일이 삭제된 경우가 아니면 노트 로드 시도
      if (eventType !== 'unlink') {
        try {
          eventData.note = await loadNote(filePath, { validateFrontMatter: false });
        } catch (error) {
          logger.warn(`이벤트 처리 중 노트 로드 실패: ${filePath}`, error);
        }
      }

      logger.debug(`파일 이벤트 처리 완료: ${eventType} ${filePath}`);

      // 이벤트 발생
      this.emit('fileChange', eventData);
      this.emit(eventType, eventData);

    } catch (error) {
      logger.error(`파일 이벤트 처리 오류: ${eventType} ${filePath}`, error);
      this.emit('error', error);
    }
  }

  /**
   * 마크다운 파일인지 확인
   */
  private isMarkdownFile(filePath: string): boolean {
    return /\.md$/i.test(filePath);
  }

  /**
   * 경로를 무시해야 하는지 확인
   */
  private shouldIgnorePath(filePath: string): boolean {
    return this.options.ignored.some(pattern => {
      // 간단한 glob 패턴 매칭
      if (pattern.includes('**')) {
        const regex = new RegExp(
          pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
        );
        return regex.test(filePath);
      }

      return filePath.includes(pattern);
    });
  }

  /**
   * 오류 처리
   */
  private handleError(error: Error): void {
    logger.error(`볼트 감시 오류: ${this.vaultPath}`, error);
    this.emit('error', error);
  }

  /**
   * 이벤트 핸들러 등록 (타입 안전)
   */
  onFileChange(handler: FileWatchHandler): this {
    this.on('fileChange', handler);
    return this;
  }

  onAdd(handler: FileWatchHandler): this {
    this.on('add', handler);
    return this;
  }

  onChange(handler: FileWatchHandler): this {
    this.on('change', handler);
    return this;
  }

  onUnlink(handler: FileWatchHandler): this {
    this.on('unlink', handler);
    return this;
  }

  onReady(handler: () => void): this {
    this.on('ready', handler);
    return this;
  }

  onStopped(handler: () => void): this {
    this.on('stopped', handler);
    return this;
  }

  onError(handler: (error: Error) => void): this {
    this.on('error', handler);
    return this;
  }
}

/**
 * 볼트 감시자 팩토리 함수
 */
export function createVaultWatcher(
  vaultPath: string,
  options?: VaultWatchOptions
): VaultWatcher {
  return new VaultWatcher(vaultPath, options);
}

/**
 * 간단한 파일 감시 함수 (일회성 사용)
 */
export async function watchVault(
  vaultPath: string,
  handler: FileWatchHandler,
  options?: VaultWatchOptions
): Promise<VaultWatcher> {
  const watcher = createVaultWatcher(vaultPath, options);

  watcher.onFileChange(handler);

  await watcher.start();

  return watcher;
}

/**
 * 배치 파일 변경 감지기
 */
export class BatchFileWatcher {
  private watcher: VaultWatcher;
  private batchTimeout: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, FileWatchEventData> = new Map();
  private batchDelay: number;
  private gitSnapshotManager?: GitSnapshotManager;

  constructor(
    vaultPath: string,
    batchDelay: number = 1000,
    options?: VaultWatchOptions
  ) {
    this.batchDelay = batchDelay;
    this.watcher = createVaultWatcher(vaultPath, options);

    if (options?.gitSnapshot) {
      this.gitSnapshotManager = new GitSnapshotManager(
        options.gitSnapshot.repositoryPath ?? vaultPath,
        options.gitSnapshot
      );
    }

    this.watcher.onFileChange((eventData) => {
      this.addToBatch(eventData);
    });
  }

  /**
   * 배치에 변경사항 추가
   */
  private addToBatch(eventData: FileWatchEventData): void {
    this.pendingChanges.set(eventData.filePath, eventData);

    // 기존 타이머 취소
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // 새 타이머 설정
    this.batchTimeout = setTimeout(() => {
      void this.processBatch();
    }, this.batchDelay);
  }

  /**
   * 배치 처리
   */
  private async processBatch(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    this.batchTimeout = null;

    logger.debug(`배치 파일 변경 처리: ${changes.length}개 파일`);

    this.watcher.emit('batchChange', changes);

    if (this.gitSnapshotManager) {
      try {
        await this.gitSnapshotManager.createSnapshot(changes);
      } catch (error) {
        logger.error('Git 스냅샷 처리 실패', error);
        const err = error instanceof Error
          ? error
          : new StorageMdError('Git 스냅샷 처리 실패', 'GIT_SNAPSHOT_ERROR', undefined, error);
        this.watcher.emit('error', err);
      }
    }
  }

  /**
   * 감시 시작
   */
  async start(): Promise<void> {
    if (this.gitSnapshotManager) {
      await this.gitSnapshotManager.initialize();
    }

    await this.watcher.start();
  }

  /**
   * 감시 중지
   */
  async stop(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.pendingChanges.clear();
    await this.watcher.stop();
  }

  /**
   * 배치 변경 이벤트 핸들러 등록
   */
  onBatchChange(handler: (changes: FileWatchEventData[]) => void): this {
    this.watcher.on('batchChange', handler);
    return this;
  }

  /**
   * 다른 이벤트들은 내부 watcher에 위임
   */
  get watching(): boolean {
    return this.watcher.watching;
  }

  onError(handler: (error: Error) => void): this {
    this.watcher.onError(handler);
    return this;
  }

  onReady(handler: () => void): this {
    this.watcher.onReady(handler);
    return this;
  }
}