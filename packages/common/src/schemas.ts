import { z } from 'zod';

/**
 * PARA 조직 체계의 카테고리
 */
export const PARA_CATEGORIES = [
  'Projects',
  'Areas',
  'Resources',
  'Archives',
] as const;

export const ParaCategorySchema = z.enum(PARA_CATEGORIES).optional();
export type ParaCategory = z.infer<typeof ParaCategorySchema>;

/**
 * UID 형식 (예: 20250927T103000123456Z - 밀리초+카운터 포함)
 */
export const UidSchema = z
  .string()
  .regex(
    /^\d{8}T\d{12}Z$/,
    'UID는 ISO 8601 기반 타임스탬프 형식이어야 합니다 (예: 20250927T103000123456Z)'
  );
export type Uid = z.infer<typeof UidSchema>;

/**
 * Front Matter 스키마
 */
export const FrontMatterSchema = z.object({
  id: UidSchema,
  title: z.string().min(1),
  category: ParaCategorySchema,
  tags: z.array(z.string()).default([]),
  project: z.string().optional(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  links: z.array(z.string()).default([]),
});

export type FrontMatter = z.infer<typeof FrontMatterSchema>;

/**
 * Markdown 노트 전체 구조
 */
export const MarkdownNoteSchema = z.object({
  frontMatter: FrontMatterSchema,
  content: z.string(),
  filePath: z.string(),
});

export type MarkdownNote = z.infer<typeof MarkdownNoteSchema>;

/**
 * 검색 쿼리 스키마
 */
export const SearchQuerySchema = z.object({
  query: z.string(),
  category: ParaCategorySchema.optional(),
  tags: z.array(z.string()).optional(),
  project: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
