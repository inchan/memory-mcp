/**
 * Front Matter 처리 모듈
 */

import matter from 'gray-matter';
import { z } from 'zod';
import {
  FrontMatterSchema,
  FrontMatter,
  MarkdownNote,
  generateUid,
  logger
} from '@memory-mcp/common';
import {
  FrontMatterValidationError,
  UpdateFrontMatterOptions,
  StorageMdError
} from './types';

/**
 * Front Matter 파싱 결과
 */
interface ParseResult {
  frontMatter: FrontMatter;
  content: string;
  isEmpty: boolean;
}

/**
 * Front Matter 기본값 생성
 * @param title - 노트 제목
 * @param category - PARA 카테고리 (선택 사항, 없으면 Zettelkasten 폴더에 저장됨)
 */
function createDefaultFrontMatter(
  title: string,
  category?: FrontMatter['category']
): Partial<FrontMatter> {
  const now = new Date().toISOString();

  const base = {
    id: generateUid(),
    title: title || 'Untitled',
    tags: [],
    created: now,
    updated: now,
    links: [],
  };

  // category가 제공된 경우에만 추가
  return category ? { ...base, category } : base;
}

/**
 * Zod 오류를 사용자 친화적 메시지로 변환
 */
function formatValidationErrors(error: z.ZodError): string[] {
  return error.errors.map(err => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });
}

/**
 * Markdown 파일의 Front Matter 파싱
 */
export function parseFrontMatter(
  fileContent: string,
  filePath?: string,
  strict: boolean = true
): ParseResult {
  try {
    // gray-matter로 파싱
    const parsed = matter(fileContent);
    const contentBody = parsed.content.startsWith('\r\n')
      ? parsed.content.slice(2)
      : parsed.content.startsWith('\n')
      ? parsed.content.slice(1)
      : parsed.content;

    // Front Matter가 비어있는 경우
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      logger.debug(`Front Matter가 비어있음: ${filePath || 'unknown'}`);

      if (strict) {
        throw new FrontMatterValidationError(
          'Front Matter가 없거나 비어있습니다',
          filePath
        );
      }

      return {
        frontMatter: createDefaultFrontMatter('Untitled') as FrontMatter,
        content: contentBody,
        isEmpty: true,
      };
    }

    // Zod 스키마 검증
    const validationResult = FrontMatterSchema.safeParse(parsed.data);

    if (!validationResult.success) {
      const errors = formatValidationErrors(validationResult.error);
      logger.warn(`Front Matter 검증 실패: ${filePath || 'unknown'}`, errors);

      if (strict) {
        throw new FrontMatterValidationError(
          `Front Matter 검증 실패: ${errors.join(', ')}`,
          filePath,
          errors
        );
      }

      // 비엄격 모드에서는 기본값과 병합
      const defaultFM = createDefaultFrontMatter(
        parsed.data.title || 'Untitled',
        parsed.data.category
      );

      const mergedFM = { ...defaultFM, ...parsed.data };
      const finalValidation = FrontMatterSchema.safeParse(mergedFM);

      if (!finalValidation.success) {
        // 여전히 실패하면 완전히 기본값 사용
        return {
          frontMatter: createDefaultFrontMatter('Untitled') as FrontMatter,
          content: contentBody,
          isEmpty: false,
        };
      }

      return {
        frontMatter: finalValidation.data,
        content: contentBody,
        isEmpty: false,
      };
    }

    return {
      frontMatter: validationResult.data,
      content: contentBody,
      isEmpty: false,
    };

  } catch (error) {
    if (error instanceof FrontMatterValidationError) {
      throw error;
    }

    throw new StorageMdError(
      `Front Matter 파싱 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FRONT_MATTER_PARSE_ERROR',
      filePath,
      error
    );
  }
}

/**
 * Front Matter를 YAML 문자열로 직렬화
 */
export function serializeFrontMatter(frontMatter: FrontMatter): string {
  try {
    // Zod 스키마로 재검증 (안전성)
    const validated = FrontMatterSchema.parse(frontMatter);

    // undefined 값 제거 (gray-matter는 undefined를 처리할 수 없음)
    const cleanedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(validated)) {
      if (value !== undefined) {
        cleanedData[key] = value;
      }
    }

    // gray-matter를 사용하여 YAML로 직렬화
    const serialized = matter.stringify('', cleanedData);

    // Front Matter 부분만 추출 (--- 포함)
    const frontMatterMatch = serialized.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
      throw new Error('Front Matter 직렬화 결과가 예상과 다릅니다');
    }

    return frontMatterMatch[0];

  } catch (error) {
    throw new StorageMdError(
      `Front Matter 직렬화 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FRONT_MATTER_SERIALIZE_ERROR',
      undefined,
      error
    );
  }
}

/**
 * 전체 Markdown 노트를 문자열로 직렬화
 */
export function serializeMarkdownNote(note: MarkdownNote): string {
  try {
    const frontMatterYaml = serializeFrontMatter(note.frontMatter);
    return `${frontMatterYaml}\n\n${note.content}`;
  } catch (error) {
    throw new StorageMdError(
      `Markdown 노트 직렬화 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'MARKDOWN_SERIALIZE_ERROR',
      note.filePath,
      error
    );
  }
}

/**
 * Front Matter 부분 업데이트
 */
export function updateFrontMatter(
  currentFrontMatter: FrontMatter,
  updates: Partial<FrontMatter>,
  options: UpdateFrontMatterOptions = {}
): FrontMatter {
  const {
    updateTimestamp = true,
    allowPartial = true,
  } = options;

  try {
    // 업데이트 적용
    let updatedFrontMatter = { ...currentFrontMatter, ...updates };

    // 타임스탬프 자동 갱신
    if (updateTimestamp) {
      updatedFrontMatter.updated = new Date().toISOString();
    }

    // 스키마 검증
    const validationResult = FrontMatterSchema.safeParse(updatedFrontMatter);

    if (!validationResult.success) {
      const errors = formatValidationErrors(validationResult.error);

      if (!allowPartial) {
        throw new FrontMatterValidationError(
          `Front Matter 업데이트 검증 실패: ${errors.join(', ')}`,
          undefined,
          errors
        );
      }

      // 부분 업데이트 허용 - 실패한 필드는 원래 값 유지
      logger.warn('Front Matter 업데이트 중 일부 검증 실패, 원래 값 유지', errors);

      for (const error of validationResult.error.errors) {
        const fieldPath = error.path.join('.');
        logger.debug(`검증 실패 필드 복원: ${fieldPath}`);

        // 중첩 객체 처리는 간단히 최상위 필드만
        if (error.path.length === 1) {
          const field = error.path[0] as keyof FrontMatter;
          if (field in currentFrontMatter) {
            (updatedFrontMatter as any)[field] = currentFrontMatter[field];
          }
        }
      }

      // 재검증
      const revalidated = FrontMatterSchema.safeParse(updatedFrontMatter);
      if (!revalidated.success) {
        // 여전히 실패하면 전체 롤백
        logger.error('Front Matter 업데이트 후 재검증 실패, 전체 롤백');
        return currentFrontMatter;
      }

      updatedFrontMatter = revalidated.data;
    } else {
      updatedFrontMatter = validationResult.data;
    }

    logger.debug('Front Matter 업데이트 완료', {
      id: updatedFrontMatter.id,
      title: updatedFrontMatter.title
    });

    return updatedFrontMatter;

  } catch (error) {
    if (error instanceof FrontMatterValidationError) {
      throw error;
    }

    throw new StorageMdError(
      `Front Matter 업데이트 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FRONT_MATTER_UPDATE_ERROR',
      undefined,
      error
    );
  }
}

/**
 * Front Matter에 링크 추가
 */
export function addLinkToFrontMatter(
  frontMatter: FrontMatter,
  linkUid: string
): FrontMatter {
  const currentLinks = frontMatter.links || [];

  // 중복 방지
  if (currentLinks.includes(linkUid)) {
    return frontMatter;
  }

  return updateFrontMatter(frontMatter, {
    links: [...currentLinks, linkUid]
  });
}

/**
 * Front Matter에서 링크 제거
 */
export function removeLinkFromFrontMatter(
  frontMatter: FrontMatter,
  linkUid: string
): FrontMatter {
  const currentLinks = frontMatter.links || [];
  const updatedLinks = currentLinks.filter(uid => uid !== linkUid);

  return updateFrontMatter(frontMatter, {
    links: updatedLinks
  });
}

/**
 * Front Matter에 태그 추가
 */
export function addTagToFrontMatter(
  frontMatter: FrontMatter,
  tag: string
): FrontMatter {
  const currentTags = frontMatter.tags || [];

  // 중복 방지
  if (currentTags.includes(tag)) {
    return frontMatter;
  }

  return updateFrontMatter(frontMatter, {
    tags: [...currentTags, tag]
  });
}

/**
 * Front Matter에서 태그 제거
 */
export function removeTagFromFrontMatter(
  frontMatter: FrontMatter,
  tag: string
): FrontMatter {
  const currentTags = frontMatter.tags || [];
  const updatedTags = currentTags.filter(t => t !== tag);

  return updateFrontMatter(frontMatter, {
    tags: updatedTags
  });
}

/**
 * 제목에서 자동으로 기본 Front Matter 생성
 */
export function generateFrontMatterFromTitle(
  title: string,
  category?: FrontMatter['category'],
  additionalData?: Partial<FrontMatter>
): FrontMatter {
  const defaultFM = createDefaultFrontMatter(title, category);
  const merged = { ...defaultFM, ...additionalData };

  // 검증
  const validated = FrontMatterSchema.parse(merged);
  return validated;
}

/**
 * Front Matter 필드 유효성 개별 검증
 */
export function validateFrontMatterField(
  field: keyof FrontMatter,
  value: any
): boolean {
  try {
    const fieldSchema = FrontMatterSchema.shape[field];
    fieldSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Front Matter 깊은 비교
 */
export function frontMatterEquals(
  fm1: FrontMatter,
  fm2: FrontMatter
): boolean {
  try {
    return JSON.stringify(fm1) === JSON.stringify(fm2);
  } catch {
    return false;
  }
}

/**
 * Front Matter 요약 정보 생성 (로깅용)
 */
export function createFrontMatterSummary(frontMatter: FrontMatter): Record<string, any> {
  return {
    id: frontMatter.id,
    title: frontMatter.title,
    category: frontMatter.category,
    tagCount: frontMatter.tags?.length || 0,
    linkCount: frontMatter.links?.length || 0,
    project: frontMatter.project,
    created: frontMatter.created,
    updated: frontMatter.updated,
  };
}