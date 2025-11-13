import { ParaCategorySchema } from '@memory-mcp/common';
import { z } from 'zod';

export const SearchMemoryInputSchema = z
  .object({
    query: z
      .string({
        required_error: '검색어는 필수 입력값입니다.',
        invalid_type_error: '검색어는 문자열이어야 합니다.',
      })
      .min(1, '검색어는 최소 1자 이상이어야 합니다.'),
    category: ParaCategorySchema.optional(),
    tags: z
      .array(z.string().min(1, '태그는 최소 1자 이상이어야 합니다.'))
      .default([])
      .optional(),
    limit: z
      .number({ invalid_type_error: 'limit는 숫자여야 합니다.' })
      .int('limit는 정수여야 합니다.')
      .min(1, 'limit는 최소 1 이상이어야 합니다.')
      .max(100, 'limit는 최대 100까지 허용됩니다.')
      .default(10)
      .optional(),
    offset: z
      .number({ invalid_type_error: 'offset은 숫자여야 합니다.' })
      .int('offset은 정수여야 합니다.')
      .min(0, 'offset은 음수가 될 수 없습니다.')
      .default(0)
      .optional(),
  })
  .strict();

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export const CreateNoteInputSchema = z
  .object({
    title: z
      .string({
        required_error: '제목은 필수 입력값입니다.',
        invalid_type_error: '제목은 문자열이어야 합니다.',
      })
      .min(1, '제목은 최소 1자 이상이어야 합니다.'),
    content: z
      .string({
        required_error: '내용은 필수 입력값입니다.',
        invalid_type_error: '내용은 문자열이어야 합니다.',
      })
      .min(1, '내용은 최소 1자 이상이어야 합니다.'),
    category: ParaCategorySchema.default('Resources'),
    tags: z
      .array(z.string().min(1, '태그는 최소 1자 이상이어야 합니다.'))
      .default([]),
    project: z
      .string({ invalid_type_error: 'project는 문자열이어야 합니다.' })
      .min(1, 'project는 최소 1자 이상이어야 합니다.')
      .optional(),
    links: z
      .array(z.string().min(1, '링크 ID는 최소 1자 이상이어야 합니다.'))
      .default([])
      .optional(),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

// read_note - Read a single note by UID
export const ReadNoteInputSchema = z
  .object({
    uid: z
      .string({
        required_error: 'UID는 필수 입력값입니다.',
        invalid_type_error: 'UID는 문자열이어야 합니다.',
      })
      .min(1, 'UID는 최소 1자 이상이어야 합니다.'),
    includeMetadata: z
      .boolean()
      .default(false)
      .optional()
      .describe('메타데이터(파일 크기, 단어 수 등) 포함 여부'),
    includeLinks: z
      .boolean()
      .default(false)
      .optional()
      .describe('링크 분석(백링크, 깨진 링크 등) 포함 여부'),
  })
  .strict();

export type ReadNoteInput = z.infer<typeof ReadNoteInputSchema>;

// update_note - Update existing note
export const UpdateNoteInputSchema = z
  .object({
    uid: z
      .string({
        required_error: 'UID는 필수 입력값입니다.',
      })
      .min(1, 'UID는 최소 1자 이상이어야 합니다.'),
    title: z.string().min(1, '제목은 최소 1자 이상이어야 합니다.').optional(),
    content: z.string().optional(),
    category: ParaCategorySchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    project: z.string().min(1).optional().nullable(),
    links: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine(
    data => {
      const { uid, ...updateFields } = data;
      return Object.keys(updateFields).length > 0;
    },
    { message: '최소 하나의 업데이트 필드가 필요합니다.' }
  );

export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

// delete_note - Delete a note
export const DeleteNoteInputSchema = z
  .object({
    uid: z
      .string({
        required_error: 'UID는 필수 입력값입니다.',
      })
      .min(1, 'UID는 최소 1자 이상이어야 합니다.'),
    confirm: z
      .boolean({
        required_error: '삭제 확인은 필수입니다.',
      })
      .refine(val => val === true, {
        message: '삭제를 확인하려면 confirm을 true로 설정해야 합니다.',
      }),
  })
  .strict();

export type DeleteNoteInput = z.infer<typeof DeleteNoteInputSchema>;

// list_notes - List notes with filters
export const ListNotesInputSchema = z
  .object({
    category: ParaCategorySchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    project: z.string().min(1).optional(),
    limit: z
      .number()
      .int('limit는 정수여야 합니다.')
      .min(1, 'limit는 최소 1 이상이어야 합니다.')
      .max(1000, 'limit는 최대 1000까지 허용됩니다.')
      .default(100)
      .optional(),
    offset: z
      .number()
      .int('offset은 정수여야 합니다.')
      .min(0, 'offset은 음수가 될 수 없습니다.')
      .default(0)
      .optional(),
    sortBy: z
      .enum(['created', 'updated', 'title'])
      .default('updated')
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  })
  .strict();

export type ListNotesInput = z.infer<typeof ListNotesInputSchema>;

export const ToolNameSchema = z.enum([
  'search_memory',
  'create_note',
  'read_note',
  'update_note',
  'delete_note',
  'list_notes',
]);

export type ToolName = z.infer<typeof ToolNameSchema>;
