import { z } from 'zod';
import type { OpenApiSchemaSerializer } from './types';

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return value instanceof z.ZodType;
}

export const zod4SchemaSerializer: OpenApiSchemaSerializer = (schema) => {
  if (!isZodSchema(schema)) {
    return null;
  }
  return z.toJSONSchema(schema) as Record<string, unknown>;
};
