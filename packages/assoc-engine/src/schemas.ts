import { z } from "zod";
import { UidSchema } from "@memory-mcp/common";

const ContextNoteSchema = z
  .object({
    id: z.union([UidSchema, z.string().min(1, "노트 ID는 필수입니다.")]),
    weight: z
      .number({ invalid_type_error: "weight는 숫자여야 합니다." })
      .min(0, "weight는 0 이상이어야 합니다.")
      .max(1, "weight는 1 이하이어야 합니다.")
      .default(1)
      .optional(),
    tags: z.array(z.string().min(1)).default([]).optional(),
  })
  .strict();

export const AssociationRequestSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId는 필수입니다."),
    query: z.string().min(1, "query는 최소 1자 이상이어야 합니다."),
    limit: z
      .number({ invalid_type_error: "limit는 숫자여야 합니다." })
      .int("limit는 정수여야 합니다.")
      .min(1, "limit는 1 이상이어야 합니다.")
      .max(20, "limit는 최대 20까지 허용됩니다.")
      .default(5)
      .optional(),
    tags: z.array(z.string().min(1)).default([]).optional(),
    contextNotes: z.array(ContextNoteSchema).default([]).optional(),
  })
  .strict();

export const SessionContextCommandSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId는 필수입니다."),
    operation: z.enum(["get", "update", "reset"]).default("get"),
    focusNotes: z.array(ContextNoteSchema).default([]).optional(),
    tags: z.array(z.string().min(1)).default([]).optional(),
    query: z.string().min(1).optional(),
  })
  .strict();

export const ReflectionToolRequestSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId는 필수입니다."),
    limit: z
      .number({ invalid_type_error: "limit는 숫자여야 합니다." })
      .int("limit는 정수여야 합니다.")
      .min(1, "limit는 1 이상이어야 합니다.")
      .max(10, "limit는 최대 10까지 허용됩니다.")
      .default(5)
      .optional(),
  })
  .strict();

export type AssociationRequestInput = z.infer<typeof AssociationRequestSchema>;
export type SessionContextCommandInput = z.infer<typeof SessionContextCommandSchema>;
export type ReflectionToolRequestInput = z.infer<typeof ReflectionToolRequestSchema>;
