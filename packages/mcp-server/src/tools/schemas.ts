import { ParaCategorySchema } from "@memory-mcp/common";
import {
  AssociationRequestSchema,
  SessionContextCommandSchema,
  ReflectionToolRequestSchema,
} from "@memory-mcp/assoc-engine";
import { z } from "zod";

export const SearchMemoryInputSchema = z
  .object({
    query: z
      .string({
        required_error: "검색어는 필수 입력값입니다.",
        invalid_type_error: "검색어는 문자열이어야 합니다.",
      })
      .min(1, "검색어는 최소 1자 이상이어야 합니다."),
    category: ParaCategorySchema.optional(),
    tags: z
      .array(z.string().min(1, "태그는 최소 1자 이상이어야 합니다."))
      .default([])
      .optional(),
    limit: z
      .number({ invalid_type_error: "limit는 숫자여야 합니다." })
      .int("limit는 정수여야 합니다.")
      .min(1, "limit는 최소 1 이상이어야 합니다.")
      .max(100, "limit는 최대 100까지 허용됩니다.")
      .default(10)
      .optional(),
    offset: z
      .number({ invalid_type_error: "offset은 숫자여야 합니다." })
      .int("offset은 정수여야 합니다.")
      .min(0, "offset은 음수가 될 수 없습니다.")
      .default(0)
      .optional(),
  })
  .strict();

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export const CreateNoteInputSchema = z
  .object({
    title: z
      .string({
        required_error: "제목은 필수 입력값입니다.",
        invalid_type_error: "제목은 문자열이어야 합니다.",
      })
      .min(1, "제목은 최소 1자 이상이어야 합니다."),
    content: z
      .string({
        required_error: "내용은 필수 입력값입니다.",
        invalid_type_error: "내용은 문자열이어야 합니다.",
      })
      .min(1, "내용은 최소 1자 이상이어야 합니다."),
    category: ParaCategorySchema.default("Resources"),
    tags: z
      .array(z.string().min(1, "태그는 최소 1자 이상이어야 합니다."))
      .default([]),
    project: z
      .string({ invalid_type_error: "project는 문자열이어야 합니다." })
      .min(1, "project는 최소 1자 이상이어야 합니다.")
      .optional(),
    links: z
      .array(z.string().min(1, "링크 ID는 최소 1자 이상이어야 합니다."))
      .default([])
      .optional(),
  })
  .strict();

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export const ToolNameSchema = z.enum([
  "search_memory",
  "create_note",
  "associate_memory",
  "session_context",
  "reflect_session",
]);

export type ToolName = z.infer<typeof ToolNameSchema>;

export {
  AssociationRequestSchema,
  SessionContextCommandSchema,
  ReflectionToolRequestSchema,
};
