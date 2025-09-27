/**
 * PARA (Projects/Areas/Resources/Archives) 구조 자동 관리 모듈
 */

import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '@memory-mcp/common';
import type { MarkdownNote, FrontMatter } from '@memory-mcp/common';
import {
  ensureDirectory,
  directoryExists,
  moveFile,
  normalizePath,
  listFiles
} from './file-operations';
import { loadNote, saveNote } from './note-manager';
import { updateFrontMatter } from './front-matter';
import { StorageMdError } from './types';

/**
 * PARA 카테고리 정의
 */
export type ParaCategory = 'Projects' | 'Areas' | 'Resources' | 'Archives';

/**
 * PARA 구조 설정
 */
export interface ParaStructureConfig {
  /**
   * 루트 디렉토리
   */
  rootPath: string;

  /**
   * 카테고리별 디렉토리 설정
   */
  directories: Record<ParaCategory, string>;

  /**
   * 자동 이동 활성화 여부 (기본: true)
   */
  autoMove?: boolean;

  /**
   * 프로젝트별 서브디렉토리 생성 여부 (기본: true)
   */
  createProjectSubdirs?: boolean;

  /**
   * 아카이브 임계값 (일, 기본: 90)
   */
  archiveThresholdDays?: number;
}

/**
 * PARA 이동 이벤트
 */
export interface ParaMoveEvent {
  noteId: string;
  fromPath: string;
  toPath: string;
  fromCategory: ParaCategory;
  toCategory: ParaCategory;
  reason: 'manual' | 'auto-archive' | 'project-change' | 'category-change';
  timestamp: Date;
}

/**
 * 기본 PARA 구조 설정
 */
const DEFAULT_PARA_CONFIG: Required<ParaStructureConfig> = {
  rootPath: '',
  directories: {
    Projects: '1-Projects',
    Areas: '2-Areas',
    Resources: '3-Resources',
    Archives: '4-Archives'
  },
  autoMove: true,
  createProjectSubdirs: true,
  archiveThresholdDays: 90
};

/**
 * PARA 구조 관리 클래스
 */
export class ParaManager extends EventEmitter {
  private config: Required<ParaStructureConfig>;
  private isInitialized: boolean = false;

  constructor(config: ParaStructureConfig) {
    super();

    this.config = {
      ...DEFAULT_PARA_CONFIG,
      ...config,
      directories: {
        ...DEFAULT_PARA_CONFIG.directories,
        ...config.directories
      }
    };

    logger.debug('ParaManager 생성', { config: this.config });
  }

  /**
   * PARA 구조 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('ParaManager는 이미 초기화되었습니다');
      return;
    }

    try {
      logger.debug(`PARA 구조 초기화 시작: ${this.config.rootPath}`);

      // 각 카테고리 디렉토리 생성
      for (const [category, dirName] of Object.entries(this.config.directories)) {
        const dirPath = path.join(this.config.rootPath, dirName);
        await ensureDirectory(dirPath);
        logger.debug(`카테고리 디렉토리 생성: ${category} → ${dirPath}`);
      }

      this.isInitialized = true;
      logger.info(`PARA 구조 초기화 완료: ${this.config.rootPath}`);

    } catch (error) {
      throw new StorageMdError(
        `PARA 구조 초기화 실패: ${this.config.rootPath}`,
        'PARA_INIT_ERROR',
        this.config.rootPath,
        error
      );
    }
  }

  /**
   * 노트를 적절한 PARA 카테고리로 이동
   */
  async organizeNote(note: MarkdownNote): Promise<string | null> {
    if (!this.isInitialized) {
      throw new StorageMdError(
        'ParaManager가 초기화되지 않았습니다',
        'PARA_NOT_INITIALIZED'
      );
    }

    try {
      const currentCategory = note.frontMatter.category;
      const targetCategory = this.determineTargetCategory(note);

      // 이미 올바른 카테고리에 있으면 스킵
      if (currentCategory === targetCategory) {
        logger.debug(`노트가 이미 올바른 카테고리에 있음: ${note.frontMatter.id} (${targetCategory})`);
        return null;
      }

      // 목표 경로 계산
      const targetPath = await this.calculateTargetPath(note, targetCategory);

      if (normalizePath(note.filePath) === normalizePath(targetPath)) {
        // 경로가 동일하면 카테고리만 업데이트
        return await this.updateNoteCategory(note, targetCategory);
      }

      // 자동 이동이 활성화된 경우 파일 이동
      if (this.config.autoMove) {
        return await this.moveNote(note, targetPath, targetCategory, 'category-change');
      } else {
        // 자동 이동 비활성화 시 카테고리만 업데이트
        return await this.updateNoteCategory(note, targetCategory);
      }

    } catch (error) {
      throw new StorageMdError(
        `노트 정리 실패: ${note.frontMatter.id}`,
        'PARA_ORGANIZE_ERROR',
        note.filePath,
        error
      );
    }
  }

  /**
   * 목표 카테고리 결정
   */
  private determineTargetCategory(note: MarkdownNote): ParaCategory {
    const frontMatter = note.frontMatter;

    // 프로젝트가 지정된 경우 Projects
    if (frontMatter.project && frontMatter.project.trim()) {
      return 'Projects';
    }

    // 아카이브 조건 확인
    if (this.shouldArchive(note)) {
      return 'Archives';
    }

    // 기존 카테고리가 유효하면 유지
    const validCategories: ParaCategory[] = ['Projects', 'Areas', 'Resources', 'Archives'];
    if (validCategories.includes(frontMatter.category as ParaCategory)) {
      return frontMatter.category as ParaCategory;
    }

    // 기본값: Resources
    return 'Resources';
  }

  /**
   * 아카이브 대상인지 확인
   */
  private shouldArchive(note: MarkdownNote): boolean {
    if (!note.frontMatter.updated) {
      return false;
    }

    const lastUpdated = new Date(note.frontMatter.updated);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));

    return daysDiff > this.config.archiveThresholdDays;
  }

  /**
   * 목표 경로 계산
   */
  private async calculateTargetPath(note: MarkdownNote, category: ParaCategory): Promise<string> {
    const categoryDir = this.config.directories[category];
    let targetDir = path.join(this.config.rootPath, categoryDir);

    // 프로젝트 카테고리이고 프로젝트별 서브디렉토리 생성이 활성화된 경우
    if (category === 'Projects' &&
        this.config.createProjectSubdirs &&
        note.frontMatter.project) {

      const projectDirName = this.sanitizeDirName(note.frontMatter.project);
      targetDir = path.join(targetDir, projectDirName);
      await ensureDirectory(targetDir);
    }

    // 파일명 생성 (제목 기반)
    const fileName = this.generateFileName(note.frontMatter.title);
    return normalizePath(path.join(targetDir, fileName));
  }

  /**
   * 디렉토리명 정리
   */
  private sanitizeDirName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50); // 길이 제한
  }

  /**
   * 파일명 생성
   */
  private generateFileName(title: string): string {
    const sanitized = this.sanitizeDirName(title);
    return `${sanitized}.md`;
  }

  /**
   * 노트 이동
   */
  private async moveNote(
    note: MarkdownNote,
    targetPath: string,
    targetCategory: ParaCategory,
    reason: ParaMoveEvent['reason']
  ): Promise<string> {
    const originalPath = note.filePath;

    try {
      logger.debug(`노트 이동: ${originalPath} → ${targetPath}`);

      // 목표 디렉토리 생성
      const targetDir = path.dirname(targetPath);
      await ensureDirectory(targetDir);

      // 파일 이동
      await moveFile(originalPath, targetPath);

      // Front Matter 업데이트
      const updatedNote: MarkdownNote = {
        ...note,
        filePath: targetPath,
        frontMatter: updateFrontMatter(note.frontMatter, {
          category: targetCategory
        })
      };

      await saveNote(updatedNote, { atomic: true });

      // 이동 이벤트 발생
      const moveEvent: ParaMoveEvent = {
        noteId: note.frontMatter.id,
        fromPath: originalPath,
        toPath: targetPath,
        fromCategory: note.frontMatter.category as ParaCategory,
        toCategory: targetCategory,
        reason,
        timestamp: new Date()
      };

      this.emit('noteMoved', moveEvent);

      logger.debug(`노트 이동 완료: ${note.frontMatter.id}`);
      return targetPath;

    } catch (error) {
      throw new StorageMdError(
        `노트 이동 실패: ${originalPath} → ${targetPath}`,
        'PARA_MOVE_ERROR',
        originalPath,
        error
      );
    }
  }

  /**
   * 노트 카테고리만 업데이트 (이동 없이)
   */
  private async updateNoteCategory(note: MarkdownNote, category: ParaCategory): Promise<string> {
    try {
      const updatedNote: MarkdownNote = {
        ...note,
        frontMatter: updateFrontMatter(note.frontMatter, {
          category
        })
      };

      await saveNote(updatedNote, { atomic: true });

      logger.debug(`노트 카테고리 업데이트: ${note.frontMatter.id} → ${category}`);
      return note.filePath;

    } catch (error) {
      throw new StorageMdError(
        `노트 카테고리 업데이트 실패: ${note.frontMatter.id}`,
        'PARA_CATEGORY_UPDATE_ERROR',
        note.filePath,
        error
      );
    }
  }

  /**
   * 오래된 노트들을 Archives로 이동
   */
  async archiveOldNotes(): Promise<ParaMoveEvent[]> {
    if (!this.isInitialized) {
      throw new StorageMdError(
        'ParaManager가 초기화되지 않았습니다',
        'PARA_NOT_INITIALIZED'
      );
    }

    try {
      logger.info('오래된 노트 아카이브 시작');

      const archivedNotes: ParaMoveEvent[] = [];

      // Projects와 Areas에서 오래된 노트 찾기
      const categoriesToCheck: ParaCategory[] = ['Projects', 'Areas'];

      for (const category of categoriesToCheck) {
        const categoryDir = path.join(this.config.rootPath, this.config.directories[category]);

        if (!(await directoryExists(categoryDir))) {
          continue;
        }

        const markdownFiles = await listFiles(categoryDir, /\.md$/i, true);

        for (const filePath of markdownFiles) {
          try {
            const note = await loadNote(filePath, { validateFrontMatter: false });

            if (this.shouldArchive(note)) {
              const targetPath = await this.calculateTargetPath(note, 'Archives');
              const newPath = await this.moveNote(note, targetPath, 'Archives', 'auto-archive');

              archivedNotes.push({
                noteId: note.frontMatter.id,
                fromPath: filePath,
                toPath: newPath,
                fromCategory: category,
                toCategory: 'Archives',
                reason: 'auto-archive',
                timestamp: new Date()
              });
            }

          } catch (error) {
            logger.warn(`아카이브 처리 중 파일 건너뜀: ${filePath}`, error);
          }
        }
      }

      logger.info(`오래된 노트 아카이브 완료: ${archivedNotes.length}개 노트 이동`);
      return archivedNotes;

    } catch (error) {
      throw new StorageMdError(
        `자동 아카이브 실패: ${this.config.rootPath}`,
        'PARA_AUTO_ARCHIVE_ERROR',
        this.config.rootPath,
        error
      );
    }
  }

  /**
   * 프로젝트 완료 시 관련 노트들을 Archives로 이동
   */
  async archiveProject(projectName: string): Promise<ParaMoveEvent[]> {
    if (!this.isInitialized) {
      throw new StorageMdError(
        'ParaManager가 초기화되지 않았습니다',
        'PARA_NOT_INITIALIZED'
      );
    }

    try {
      logger.info(`프로젝트 아카이브: ${projectName}`);

      const archivedNotes: ParaMoveEvent[] = [];
      const projectsDir = path.join(this.config.rootPath, this.config.directories.Projects);

      if (!(await directoryExists(projectsDir))) {
        logger.warn('Projects 디렉토리가 존재하지 않습니다');
        return archivedNotes;
      }

      const markdownFiles = await listFiles(projectsDir, /\.md$/i, true);

      for (const filePath of markdownFiles) {
        try {
          const note = await loadNote(filePath, { validateFrontMatter: false });

          if (note.frontMatter.project === projectName) {
            const targetPath = await this.calculateTargetPath(note, 'Archives');
            const newPath = await this.moveNote(note, targetPath, 'Archives', 'manual');

            archivedNotes.push({
              noteId: note.frontMatter.id,
              fromPath: filePath,
              toPath: newPath,
              fromCategory: 'Projects',
              toCategory: 'Archives',
              reason: 'manual',
              timestamp: new Date()
            });
          }

        } catch (error) {
          logger.warn(`프로젝트 아카이브 중 파일 건너뜀: ${filePath}`, error);
        }
      }

      logger.info(`프로젝트 아카이브 완료: ${projectName}, ${archivedNotes.length}개 노트 이동`);
      return archivedNotes;

    } catch (error) {
      throw new StorageMdError(
        `프로젝트 아카이브 실패: ${projectName}`,
        'PARA_PROJECT_ARCHIVE_ERROR',
        this.config.rootPath,
        error
      );
    }
  }

  /**
   * PARA 구조 통계 조회
   */
  async getStats(): Promise<Record<ParaCategory, number>> {
    if (!this.isInitialized) {
      throw new StorageMdError(
        'ParaManager가 초기화되지 않았습니다',
        'PARA_NOT_INITIALIZED'
      );
    }

    const stats: Record<ParaCategory, number> = {
      Projects: 0,
      Areas: 0,
      Resources: 0,
      Archives: 0
    };

    try {
      for (const [category, dirName] of Object.entries(this.config.directories)) {
        const categoryDir = path.join(this.config.rootPath, dirName);

        if (await directoryExists(categoryDir)) {
          const files = await listFiles(categoryDir, /\.md$/i, true);
          stats[category as ParaCategory] = files.length;
        }
      }

      return stats;

    } catch (error) {
      throw new StorageMdError(
        `PARA 통계 조회 실패: ${this.config.rootPath}`,
        'PARA_STATS_ERROR',
        this.config.rootPath,
        error
      );
    }
  }

  /**
   * 카테고리별 경로 조회
   */
  getCategoryPath(category: ParaCategory): string {
    return path.join(this.config.rootPath, this.config.directories[category]);
  }

  /**
   * 설정 조회
   */
  get configuration(): Required<ParaStructureConfig> {
    return { ...this.config };
  }

  /**
   * 이벤트 핸들러 등록
   */
  onNoteMoved(handler: (event: ParaMoveEvent) => void): this {
    this.on('noteMoved', handler);
    return this;
  }

  onError(handler: (error: Error) => void): this {
    this.on('error', handler);
    return this;
  }
}

/**
 * PARA 매니저 팩토리 함수
 */
export function createParaManager(config: ParaStructureConfig): ParaManager {
  return new ParaManager(config);
}