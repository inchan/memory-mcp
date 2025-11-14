/**
 * 노트 관리 통합 모듈
 */

import {
  MarkdownNote,
  FrontMatter,
  Uid,
  parseAllLinks,
  extractBacklinkContext,
  logger
} from '@memory-mcp/common';
import {
  readFile,
  writeFile,
  getFileStats,
  createContentHash,
  listFiles,
  normalizePath,
  fileExists
} from './file-operations';
import {
  parseFrontMatter,
  serializeMarkdownNote,
  updateFrontMatter,
  generateFrontMatterFromTitle
} from './front-matter';
import {
  StorageMdError,
  FileSystemError,
  NoteMetadata,
  LinkAnalysis,
  BacklinkInfo,
  ExtendedMarkdownNote,
  FindNoteOptions,
  ReadFileOptions,
  WriteFileOptions
} from './types';

/**
 * 파일에서 노트 로드
 */
export async function loadNote(
  filePath: string,
  options: ReadFileOptions = {}
): Promise<MarkdownNote> {
  const normalizedPath = normalizePath(filePath);

  try {
    logger.debug(`노트 로드 시작: ${normalizedPath}`);

    // 파일 존재 확인
    if (!(await fileExists(normalizedPath))) {
      throw new FileSystemError(
        `노트 파일을 찾을 수 없습니다: ${normalizedPath}`,
        normalizedPath
      );
    }

    // 파일 읽기
    const fileContent = await readFile(normalizedPath, options);

    // Front Matter 파싱
    const parseResult = parseFrontMatter(
      fileContent,
      normalizedPath,
      options.validateFrontMatter !== false
    );

    const note: MarkdownNote = {
      frontMatter: parseResult.frontMatter,
      content: parseResult.content,
      filePath: normalizedPath,
    };

    logger.debug(`노트 로드 완료: ${note.frontMatter.id} (${note.frontMatter.title})`);
    return note;

  } catch (error) {
    if (error instanceof StorageMdError || error instanceof FileSystemError) {
      throw error;
    }

    throw new StorageMdError(
      `노트 로드 실패: ${normalizedPath}`,
      'NOTE_LOAD_ERROR',
      normalizedPath,
      error
    );
  }
}

/**
 * 노트를 파일로 저장
 */
export async function saveNote(
  note: MarkdownNote,
  options: WriteFileOptions = {}
): Promise<void> {
  const normalizedPath = normalizePath(note.filePath);

  try {
    logger.debug(`노트 저장 시작: ${note.frontMatter.id} → ${normalizedPath}`);

    // updated 필드 자동 갱신
    const updatedNote = {
      ...note,
      frontMatter: updateFrontMatter(note.frontMatter, {})
    };

    // 마크다운 직렬화
    const serializedContent = serializeMarkdownNote(updatedNote);

    // 파일 저장
    await writeFile(normalizedPath, serializedContent, options);

    logger.debug(`노트 저장 완료: ${updatedNote.frontMatter.id}`);

  } catch (error) {
    if (error instanceof StorageMdError || error instanceof FileSystemError) {
      throw error;
    }

    throw new StorageMdError(
      `노트 저장 실패: ${normalizedPath}`,
      'NOTE_SAVE_ERROR',
      normalizedPath,
      error
    );
  }
}

/**
 * UID로 노트 찾기
 */
export async function findNoteByUid(
  uid: Uid,
  vaultPath: string,
  options: FindNoteOptions = {}
): Promise<MarkdownNote | null> {
  const {
    searchRoot = vaultPath,
    exactMatch = true,
    limit
  } = options;

  try {
    logger.debug(`UID로 노트 검색: ${uid} in ${searchRoot}`);

    // 마크다운 파일 목록 조회
    const markdownFiles = await listFiles(
      searchRoot,
      /\.md$/i,
      true
    );

    let foundFiles: string[] = [];

    // 각 파일의 Front Matter에서 UID 확인
    for (const filePath of markdownFiles) {
      try {
        const note = await loadNote(filePath, { validateFrontMatter: false });

        if (exactMatch) {
          if (note.frontMatter.id === uid) {
            foundFiles.push(filePath);
            if (limit && foundFiles.length >= limit) break;
          }
        } else {
          if (note.frontMatter.id.includes(uid)) {
            foundFiles.push(filePath);
            if (limit && foundFiles.length >= limit) break;
          }
        }
      } catch (error) {
        // 개별 파일 로드 실패는 무시하고 계속
        logger.warn(`파일 로드 실패, 건너뜀: ${filePath}`, error);
        continue;
      }
    }

    if (foundFiles.length === 0) {
      logger.debug(`UID에 해당하는 노트를 찾을 수 없음: ${uid}`);
      return null;
    }

    if (foundFiles.length > 1) {
      logger.warn(`중복된 UID 발견: ${uid}`, { files: foundFiles });
    }

    // 첫 번째 매칭 파일 반환
    const firstFile = foundFiles[0];
    if (!firstFile) {
      return null;
    }

    const note = await loadNote(firstFile);
    logger.debug(`UID 검색 완료: ${uid} → ${firstFile}`);

    return note;

  } catch (error) {
    throw new StorageMdError(
      `UID 검색 실패: ${uid}`,
      'UID_SEARCH_ERROR',
      searchRoot,
      error
    );
  }
}

/**
 * 노트의 메타데이터 생성
 */
export async function generateNoteMetadata(
  note: MarkdownNote
): Promise<NoteMetadata> {
  try {
    const stats = await getFileStats(note.filePath);
    const contentHash = createContentHash(note.content);

    // 단어 및 문자 수 계산
    const wordCount = countWords(note.content);
    const characterCount = note.content.length;

    return {
      fileSize: stats.size,
      birthtime: stats.birthtime,
      mtime: stats.mtime,
      contentHash,
      wordCount,
      characterCount,
    };

  } catch (error) {
    throw new StorageMdError(
      `메타데이터 생성 실패: ${note.filePath}`,
      'METADATA_GENERATION_ERROR',
      note.filePath,
      error
    );
  }
}

/**
 * 텍스트의 단어 수 계산
 */
function countWords(text: string): number {
  // 한글/영문 혼재 텍스트의 단어 수 계산
  const words = text
    .replace(/[^\w\s가-힣]/g, ' ')  // 특수문자를 공백으로
    .split(/\s+/)                   // 공백으로 분할
    .filter(word => word.length > 0); // 빈 문자열 제거

  return words.length;
}

/**
 * 노트의 링크 분석
 */
export async function analyzeLinks(
  note: MarkdownNote,
  vaultPath: string
): Promise<LinkAnalysis> {
  try {
    logger.debug(`링크 분석 시작: ${note.frontMatter.id}`);

    // 아웃바운드 링크 파싱 (Wiki + Markdown 모두)
    const linksParsed = parseAllLinks(note.content);
    const outboundLinks = linksParsed.all;

    // 인바운드 링크 검색 (백링크)
    const inboundLinks = await findBacklinks(note.frontMatter.id, vaultPath);

    // 깨진 링크 확인
    const brokenLinks: string[] = [];
    for (const link of outboundLinks) {
      const linkedNote = await findNoteByUid(link as Uid, vaultPath);
      if (!linkedNote) {
        brokenLinks.push(link);
      }
    }

    const analysis: LinkAnalysis = {
      outboundLinks,
      inboundLinks,
      brokenLinks,
    };

    logger.debug(`링크 분석 완료: ${note.frontMatter.id}`, {
      outbound: outboundLinks.length,
      inbound: inboundLinks.length,
      broken: brokenLinks.length,
      wikiLinks: linksParsed.wiki.length,
      markdownLinks: linksParsed.markdown.length,
    });

    return analysis;

  } catch (error) {
    throw new StorageMdError(
      `링크 분석 실패: ${note.frontMatter.id}`,
      'LINK_ANALYSIS_ERROR',
      note.filePath,
      error
    );
  }
}

/**
 * 특정 UID를 가리키는 백링크 찾기
 */
async function findBacklinks(
  targetUid: Uid,
  vaultPath: string
): Promise<BacklinkInfo[]> {
  const backlinks: BacklinkInfo[] = [];

  try {
    // 볼트 내 모든 마크다운 파일 검색
    const markdownFiles = await listFiles(vaultPath, /\.md$/i, true);

    for (const filePath of markdownFiles) {
      try {
        const note = await loadNote(filePath, { validateFrontMatter: false });

        // 해당 노트가 targetUid를 링크하고 있는지 확인 (Wiki + Markdown)
        const parsedLinks = parseAllLinks(note.content);

        if (parsedLinks.all.includes(targetUid)) {
          // 링크 컨텍스트 추출 (모든 컨텍스트)
          const contexts = extractBacklinkContext(note.content, targetUid);

          const backlink: BacklinkInfo = {
            sourceUid: note.frontMatter.id,
            sourceFilePath: filePath,
            sourceTitle: note.frontMatter.title,
            linkText: targetUid,
          };

          // 모든 컨텍스트 저장
          if (contexts.length > 0) {
            backlink.contexts = contexts;
            // 하위 호환성: 첫 번째 컨텍스트를 레거시 필드에도 저장
            if (contexts[0]) {
              backlink.context = contexts[0].snippet;
            }
          }

          backlinks.push(backlink);
        }

      } catch (error) {
        // 개별 파일 처리 실패는 무시
        logger.warn(`백링크 검색 중 파일 처리 실패: ${filePath}`, error);
        continue;
      }
    }

    return backlinks;

  } catch (error) {
    logger.error(`백링크 검색 실패: ${targetUid}`, error);
    return [];
  }
}

/**
 * 확장된 노트 정보 생성 (메타데이터 + 링크 분석 포함)
 */
export async function createExtendedNote(
  note: MarkdownNote,
  vaultPath: string
): Promise<ExtendedMarkdownNote> {
  try {
    const [metadata, linkAnalysis] = await Promise.all([
      generateNoteMetadata(note),
      analyzeLinks(note, vaultPath)
    ]);

    return {
      ...note,
      metadata,
      linkAnalysis,
    };

  } catch (error) {
    throw new StorageMdError(
      `확장 노트 생성 실패: ${note.frontMatter.id}`,
      'EXTENDED_NOTE_ERROR',
      note.filePath,
      error
    );
  }
}

/**
 * 제목으로 새 노트 생성
 */
export function createNewNote(
  title: string,
  content: string = '',
  filePath: string,
  category?: FrontMatter['category'],
  additionalFrontMatter?: Partial<FrontMatter>
): MarkdownNote {
  try {
    const frontMatter = generateFrontMatterFromTitle(
      title,
      category,
      additionalFrontMatter
    );

    return {
      frontMatter,
      content,
      filePath: normalizePath(filePath),
    };

  } catch (error) {
    throw new StorageMdError(
      `새 노트 생성 실패: ${title}`,
      'NEW_NOTE_ERROR',
      filePath,
      error
    );
  }
}

/**
 * 노트 복사 (새 UID로)
 */
export function cloneNote(
  note: MarkdownNote,
  newFilePath: string,
  newTitle?: string
): MarkdownNote {
  try {
    const frontMatter = generateFrontMatterFromTitle(
      newTitle || `${note.frontMatter.title} (복사)`,
      note.frontMatter.category,
      {
        tags: [...note.frontMatter.tags],
        project: note.frontMatter.project,
      }
    );

    return {
      frontMatter,
      content: note.content,
      filePath: normalizePath(newFilePath),
    };

  } catch (error) {
    throw new StorageMdError(
      `노트 복사 실패: ${note.frontMatter.id}`,
      'NOTE_CLONE_ERROR',
      newFilePath,
      error
    );
  }
}

/**
 * 볼트 내 모든 노트 로드 (배치 처리)
 */
export async function loadAllNotes(
  vaultPath: string,
  options: {
    skipInvalid?: boolean;
    concurrency?: number;
  } = {}
): Promise<MarkdownNote[]> {
  const { skipInvalid = true, concurrency = 10 } = options;

  try {
    logger.debug(`볼트 스캔 시작: ${vaultPath}`);

    // 마크다운 파일 목록 조회
    const markdownFiles = await listFiles(vaultPath, /\.md$/i, true);

    logger.debug(`${markdownFiles.length}개 파일 발견`);

    // 동시성 제한하여 배치 처리
    const notes: MarkdownNote[] = [];
    const chunks = [];

    for (let i = 0; i < markdownFiles.length; i += concurrency) {
      chunks.push(markdownFiles.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (filePath) => {
        try {
          return await loadNote(filePath, { validateFrontMatter: !skipInvalid });
        } catch (error) {
          if (skipInvalid) {
            logger.warn(`노트 로드 실패, 건너뜀: ${filePath}`, error);
            return null;
          }
          throw error;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      const validNotes = chunkResults.filter((note): note is MarkdownNote => note !== null);
      notes.push(...validNotes);
    }

    logger.debug(`볼트 스캔 완료: ${notes.length}개 노트 로드`);
    return notes;

  } catch (error) {
    throw new StorageMdError(
      `볼트 스캔 실패: ${vaultPath}`,
      'VAULT_SCAN_ERROR',
      vaultPath,
      error
    );
  }
}