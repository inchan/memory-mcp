/**
 * @memory-mcp/storage-md 내부 타입 정의
 */

import type { MarkdownNote } from '@memory-mcp/common';

/**
 * Git 스냅샷 모드
 */
export type GitSnapshotMode = 'disabled' | 'commit' | 'tag';

/**
 * Git 스냅샷 옵션
 */
export interface GitSnapshotOptions {
  repositoryPath?: string;
  mode?: GitSnapshotMode;
  commitMessageTemplate?: string;
  tagTemplate?: string;
  retries?: number;
  gitBinary?: string;
  metricsCollector?: (result: GitSnapshotResult) => void;
}

/**
 * Git 스냅샷 결과 메트릭
 */
export interface GitSnapshotResult {
  mode: GitSnapshotMode;
  success: boolean;
  changedFiles: string[];
  durationMs: number;
  commitSha?: string;
  tagName?: string;
  errorCode?: string;
  message?: string;
}

/**
 * 파일 감시 이벤트 타입
 */
export type FileWatchEvent = 'add' | 'change' | 'unlink';

/**
 * 파일 감시 이벤트 데이터
 */
export interface FileWatchEventData {
  type: FileWatchEvent;
  filePath: string;
  note?: MarkdownNote;
}

/**
 * 파일 감시 이벤트 핸들러
 */
export type FileWatchHandler = (event: FileWatchEventData) => void | Promise<void>;

/**
 * 볼트 감시 옵션
 */
export interface VaultWatchOptions {
  /**
   * 감시할 파일 패턴 (기본: "**\/*.md")
   */
  pattern?: string;

  /**
   * 무시할 패턴들
   */
  ignored?: string[];

  /**
   * 디바운스 시간 (ms, 기본: 300)
   */
  debounceMs?: number;

  /**
   * 재귀적 감시 여부 (기본: true)
   */
  recursive?: boolean;

  /**
   * Git 스냅샷 옵션
   */
  gitSnapshot?: GitSnapshotOptions;
}

/**
 * 파일 읽기 옵션
 */
export interface ReadFileOptions {
  /**
   * 인코딩 (기본: 'utf8')
   */
  encoding?: BufferEncoding;

  /**
   * Front Matter 검증 여부 (기본: true)
   */
  validateFrontMatter?: boolean;
}

/**
 * 파일 쓰기 옵션
 */
export interface WriteFileOptions {
  /**
   * 인코딩 (기본: 'utf8')
   */
  encoding?: BufferEncoding;

  /**
   * 원자적 쓰기 여부 (기본: true)
   */
  atomic?: boolean;

  /**
   * 디렉토리 자동 생성 여부 (기본: true)
   */
  ensureDir?: boolean;
}

/**
 * 노트 검색 옵션
 */
export interface FindNoteOptions {
  /**
   * 검색할 루트 디렉토리 (기본: 전체 볼트)
   */
  searchRoot?: string;

  /**
   * 정확한 매칭 여부 (기본: true)
   */
  exactMatch?: boolean;

  /**
   * 결과 제한 수 (기본: 무제한)
   */
  limit?: number;
}

/**
 * Front Matter 업데이트 옵션
 */
export interface UpdateFrontMatterOptions {
  /**
   * updated 필드 자동 갱신 여부 (기본: true)
   */
  updateTimestamp?: boolean;

  /**
   * 부분 업데이트 허용 여부 (기본: true)
   */
  allowPartial?: boolean;
}

/**
 * 백링크 정보
 */
export interface BacklinkInfo {
  /**
   * 백링크를 포함하는 노트의 UID
   */
  sourceUid: string;

  /**
   * 백링크를 포함하는 노트의 파일 경로
   */
  sourceFilePath: string;

  /**
   * 백링크를 포함하는 노트의 제목
   */
  sourceTitle: string;

  /**
   * 링크 텍스트 (위키링크의 경우)
   */
  linkText?: string;

  /**
   * 링크 주변 컨텍스트
   */
  context?: string;
}

/**
 * 링크 분석 결과
 */
export interface LinkAnalysis {
  /**
   * 아웃바운드 링크들 (이 노트가 가리키는 링크들)
   */
  outboundLinks: string[];

  /**
   * 인바운드 링크들 (이 노트를 가리키는 백링크들)
   */
  inboundLinks: BacklinkInfo[];

  /**
   * 깨진 링크들 (존재하지 않는 노트를 가리키는 링크들)
   */
  brokenLinks: string[];
}

/**
 * 노트 메타데이터
 */
export interface NoteMetadata {
  /**
   * 파일 크기 (바이트)
   */
  fileSize: number;

  /**
   * 파일 생성 시간
   */
  birthtime: Date;

  /**
   * 파일 수정 시간
   */
  mtime: Date;

  /**
   * 콘텐츠 해시 (변경 감지용)
   */
  contentHash: string;

  /**
   * 워드 카운트
   */
  wordCount: number;

  /**
   * 캐릭터 카운트
   */
  characterCount: number;
}

/**
 * 확장된 마크다운 노트 (메타데이터 포함)
 */
export interface ExtendedMarkdownNote extends MarkdownNote {
  /**
   * 노트 메타데이터
   */
  metadata: NoteMetadata;

  /**
   * 링크 분석 결과
   */
  linkAnalysis: LinkAnalysis;
}

/**
 * 오류 타입
 */
export class StorageMdError extends Error {
  constructor(
    message: string,
    public code: string,
    public filePath?: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'StorageMdError';
  }
}

/**
 * Front Matter 검증 오류
 */
export class FrontMatterValidationError extends StorageMdError {
  constructor(
    message: string,
    filePath?: string,
    public validationErrors?: string[]
  ) {
    super(message, 'FRONT_MATTER_VALIDATION_ERROR', filePath);
    this.name = 'FrontMatterValidationError';
  }
}

/**
 * 파일 시스템 오류
 */
export class FileSystemError extends StorageMdError {
  constructor(
    message: string,
    filePath?: string,
    cause?: unknown
  ) {
    super(message, 'FILE_SYSTEM_ERROR', filePath, cause);
    this.name = 'FileSystemError';
  }
}