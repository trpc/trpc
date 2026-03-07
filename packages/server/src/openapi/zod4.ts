import { z } from 'zod';
import type { OpenApiSchemaSerializer } from './types';

function isZodV4Schema(value: unknown): value is z.ZodTypeAny {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return '_zod' in value;
}

export const zod4SchemaSerializer: OpenApiSchemaSerializer = (schema) => {
  if (!isZodV4Schema(schema)) {
    return null;
  }
  return z.toJSONSchema(schema) as Record<string, unknown>;
};
