/**
 * 백링크 자동 관리 모듈
 * 파일 변경 시 관련 노트들의 백링크를 자동으로 갱신
 */

import { EventEmitter } from 'events';
import { logger } from '@memory-mcp/common';
import type { MarkdownNote, Uid } from '@memory-mcp/common';
import { VaultWatcher } from './watcher';
import { FileWatchEventData } from './types';
import { loadNote, saveNote, findNoteByUid, analyzeLinks } from './note-manager';
import { updateFrontMatter } from './front-matter';
import { StorageMdError } from './types';
import { debounce } from '@memory-mcp/common';

/**
 * 백링크 동기화 이벤트
 */
export interface BacklinkSyncEvent {
  type: 'update' | 'remove';
  targetUid: Uid;
  affectedNotes: Uid[];
  timestamp: Date;
}

/**
 * 백링크 매니저 옵션
 */
export interface BacklinkManagerOptions {
  /**
   * 자동 동기화 활성화 여부 (기본: true)
   */
  autoSync?: boolean;

  /**
   * 디바운스 시간 (ms, 기본: 1000)
   */
  debounceMs?: number;

  /**
   * 배치 처리 크기 (기본: 10)
   */
  batchSize?: number;

  /**
   * 동시 처리 수 (기본: 5)
   */
  concurrency?: number;
}

/**
 * 백링크 자동 관리 클래스
 */
export class BacklinkManager extends EventEmitter {
  private vaultPath: string;
  private watcher: VaultWatcher | null = null;
  private options: Required<BacklinkManagerOptions>;
  private pendingUpdates: Set<string> = new Set();
  private debouncedSync: Function;
  private isInitialized: boolean = false;

  constructor(vaultPath: string, options: BacklinkManagerOptions = {}) {
    super();

    this.vaultPath = vaultPath;
    this.options = {
      autoSync: options.autoSync !== false,
      debounceMs: options.debounceMs || 1000,
      batchSize: options.batchSize || 10,
      concurrency: options.concurrency || 5,
    };

    // 디바운스된 동기화 함수 생성
    const debounced = debounce(
      () => this.processPendingUpdates(),
      this.options.debounceMs
    );

    if (typeof debounced === 'function') {
      this.debouncedSync = debounced;
    } else {
      logger.warn('디바운스 함수 생성에 실패하여 기본 no-op 핸들러를 사용합니다');
      this.debouncedSync = () => {};
      (this.debouncedSync as any).cancel = () => {};
    }

    logger.debug('BacklinkManager 생성', {
      vaultPath: this.vaultPath,
      options: this.options
    });
  }

  /**
   * 백링크 매니저 초기화
   */
  async initialize(watcher?: VaultWatcher): Promise<void> {
    if (this.isInitialized) {
      logger.warn('BacklinkManager는 이미 초기화되었습니다');
      return;
    }

    try {
      logger.debug(`BacklinkManager 초기화 시작: ${this.vaultPath}`);

      if (this.options.autoSync) {
        this.watcher = watcher ?? null;

        if (this.watcher) {
          // 파일 변경 이벤트 리스너 등록
          this.watcher.onFileChange((eventData) => {
            this.handleFileChange(eventData);
          });

          logger.debug('파일 감시 이벤트 리스너 등록 완료');
        } else {
          logger.warn('VaultWatcher가 제공되지 않아 자동 동기화가 비활성화됩니다');
        }
      }

      this.isInitialized = true;
      logger.info(`BacklinkManager 초기화 완료: ${this.vaultPath}`);

    } catch (error) {
      throw new StorageMdError(
        `BacklinkManager 초기화 실패: ${this.vaultPath}`,
        'BACKLINK_MANAGER_INIT_ERROR',
        this.vaultPath,
        error
      );
    }
  }

  /**
   * 백링크 매니저 정리
   */
  async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      logger.debug('BacklinkManager 정리 시작');

      // 대기 중인 업데이트 처리
      if (this.pendingUpdates.size > 0) {
        await this.processPendingUpdates();
      }

      // 디바운스 취소
      if (typeof this.debouncedSync === 'function' && 'cancel' in this.debouncedSync) {
        (this.debouncedSync as any).cancel();
      }

      this.pendingUpdates.clear();
      this.watcher = null;
      this.isInitialized = false;

      logger.info('BacklinkManager 정리 완료');

    } catch (error) {
      logger.error('BacklinkManager 정리 중 오류', error);
    }
  }

  /**
   * 파일 변경 이벤트 처리
   */
  private handleFileChange(eventData: FileWatchEventData): void {
    try {
      logger.debug(`파일 변경 감지: ${eventData.type} ${eventData.filePath}`);

      // 노트가 로드된 경우에만 처리
      if (eventData.note) {
        const uid = eventData.note.frontMatter.id;
        this.pendingUpdates.add(uid);

        logger.debug(`백링크 업데이트 대기열 추가: ${uid}`);

        // 디바운스된 동기화 실행
        this.debouncedSync();
      }

    } catch (error) {
      logger.error(`파일 변경 처리 중 오류: ${eventData.filePath}`, error);
      this.emit('error', error);
    }
  }

  /**
   * 대기 중인 업데이트 처리
   */
  private async processPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) {
      return;
    }

    const uidsToUpdate = Array.from(this.pendingUpdates);
    this.pendingUpdates.clear();

    logger.debug(`백링크 동기화 시작: ${uidsToUpdate.length}개 노트`);

    try {
      // 배치 단위로 처리
      for (let i = 0; i < uidsToUpdate.length; i += this.options.batchSize) {
        const batch = uidsToUpdate.slice(i, i + this.options.batchSize);
        await this.processBatch(batch);
      }

      logger.debug('백링크 동기화 완료');

    } catch (error) {
      logger.error('백링크 동기화 중 오류', error);
      this.emit('error', error);
    }
  }

  /**
   * 배치 단위 처리
   */
  private async processBatch(uids: Uid[]): Promise<void> {
    // 동시성 제한하여 처리
    const chunks = [];
    for (let i = 0; i < uids.length; i += this.options.concurrency) {
      chunks.push(uids.slice(i, i + this.options.concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(uid => this.syncBacklinksForNote(uid));
      await Promise.all(promises);
    }
  }

  /**
   * 특정 노트의 백링크 동기화
   */
  async syncBacklinksForNote(uid: Uid): Promise<void> {
    try {
      logger.debug(`노트 백링크 동기화: ${uid}`);

      // 노트 로드
      const note = await findNoteByUid(uid, this.vaultPath);
      if (!note) {
        logger.warn(`노트를 찾을 수 없음: ${uid}`);
        return;
      }

      // 링크 분석
      const linkAnalysis = await analyzeLinks(note, this.vaultPath);

      // Front Matter의 links 필드 업데이트
      const updatedFrontMatter = updateFrontMatter(note.frontMatter, {
        links: linkAnalysis.outboundLinks
      });

      // 변경사항이 있으면 저장
      if (JSON.stringify(note.frontMatter.links) !== JSON.stringify(updatedFrontMatter.links)) {
        const updatedNote: MarkdownNote = {
          ...note,
          frontMatter: updatedFrontMatter
        };

        await saveNote(updatedNote, { atomic: true });

        logger.debug(`백링크 업데이트 완료: ${uid}`);

        // 동기화 이벤트 발생
        const syncEvent: BacklinkSyncEvent = {
          type: 'update',
          targetUid: uid,
          affectedNotes: linkAnalysis.outboundLinks as Uid[],
          timestamp: new Date()
        };

        this.emit('backlinkSync', syncEvent);
      }

    } catch (error) {
      logger.error(`백링크 동기화 실패: ${uid}`, error);
      throw new StorageMdError(
        `백링크 동기화 실패: ${uid}`,
        'BACKLINK_SYNC_ERROR',
        undefined,
        error
      );
    }
  }

  /**
   * 전체 볼트 백링크 재빌드
   */
  async rebuildAllBacklinks(): Promise<void> {
    try {
      logger.info(`전체 백링크 재빌드 시작: ${this.vaultPath}`);

      // 모든 노트 로드 (간단한 스캔)
      const markdownFiles = await this.listMarkdownFiles();

      logger.debug(`${markdownFiles.length}개 파일 발견`);

      const uids: Uid[] = [];

      // 모든 파일에서 UID 추출
      for (const filePath of markdownFiles) {
        try {
          const note = await loadNote(filePath, { validateFrontMatter: false });
          uids.push(note.frontMatter.id);
        } catch (error) {
          logger.warn(`파일 로드 실패, 건너뜀: ${filePath}`, error);
        }
      }

      // 배치 처리로 백링크 동기화
      for (let i = 0; i < uids.length; i += this.options.batchSize) {
        const batch = uids.slice(i, i + this.options.batchSize);
        await this.processBatch(batch);

        // 진행 상황 로그
        const progress = Math.min(i + this.options.batchSize, uids.length);
        logger.debug(`백링크 재빌드 진행: ${progress}/${uids.length}`);
      }

      logger.info(`전체 백링크 재빌드 완료: ${uids.length}개 노트 처리`);

    } catch (error) {
      throw new StorageMdError(
        `전체 백링크 재빌드 실패: ${this.vaultPath}`,
        'BACKLINK_REBUILD_ERROR',
        this.vaultPath,
        error
      );
    }
  }

  /**
   * 특정 노트 삭제 시 백링크 정리
   */
  async cleanupBacklinksForDeletedNote(deletedUid: Uid): Promise<void> {
    try {
      logger.debug(`삭제된 노트의 백링크 정리: ${deletedUid}`);

      // 모든 노트에서 삭제된 UID로의 링크 제거
      const markdownFiles = await this.listMarkdownFiles();

      const affectedNotes: Uid[] = [];

      for (const filePath of markdownFiles) {
        try {
          const note = await loadNote(filePath, { validateFrontMatter: false });

          // 링크 목록에서 삭제된 UID 제거
          const originalLinks = note.frontMatter.links || [];
          const updatedLinks = originalLinks.filter(link => link !== deletedUid);

          if (originalLinks.length !== updatedLinks.length) {
            // 변경사항이 있으면 업데이트
            const updatedFrontMatter = updateFrontMatter(note.frontMatter, {
              links: updatedLinks
            });

            const updatedNote: MarkdownNote = {
              ...note,
              frontMatter: updatedFrontMatter
            };

            await saveNote(updatedNote, { atomic: true });
            affectedNotes.push(note.frontMatter.id);

            logger.debug(`백링크 정리 완료: ${note.frontMatter.id}`);
          }

        } catch (error) {
          logger.warn(`백링크 정리 중 파일 처리 실패: ${filePath}`, error);
        }
      }

      // 정리 이벤트 발생
      if (affectedNotes.length > 0) {
        const syncEvent: BacklinkSyncEvent = {
          type: 'remove',
          targetUid: deletedUid,
          affectedNotes,
          timestamp: new Date()
        };

        this.emit('backlinkSync', syncEvent);
      }

      logger.debug(`삭제된 노트 백링크 정리 완료: ${deletedUid}, ${affectedNotes.length}개 노트 영향`);

    } catch (error) {
      throw new StorageMdError(
        `백링크 정리 실패: ${deletedUid}`,
        'BACKLINK_CLEANUP_ERROR',
        undefined,
        error
      );
    }
  }

  /**
   * 백링크 동기화 상태 확인
   */
  get syncStats() {
    return {
      isInitialized: this.isInitialized,
      pendingUpdates: this.pendingUpdates.size,
      autoSync: this.options.autoSync,
    };
  }

  /**
   * 이벤트 핸들러 등록 (타입 안전)
   */
  onBacklinkSync(handler: (event: BacklinkSyncEvent) => void): this {
    this.on('backlinkSync', handler);
    return this;
  }

  onError(handler: (error: Error) => void): this {
    this.on('error', handler);
    return this;
  }

  private async listMarkdownFiles(): Promise<string[]> {
    const { listFiles } = await import('./file-operations.js');
    return listFiles(this.vaultPath, /\.md$/i, true);
  }
}

/**
 * 백링크 매니저 팩토리 함수
 */
export function createBacklinkManager(
  vaultPath: string,
  options?: BacklinkManagerOptions
): BacklinkManager {
  return new BacklinkManager(vaultPath, options);
}