import type { Readable } from 'stream';
import z from 'zod';

function isObject(value: unknown): value is Record<string, unknown> {
  // check that value is object
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

const readableEsqueSchema = z.custom<Readable>((value) => {
  // check if file is is a Readable without importing Readable
  if (!isObject(value)) {
    return false;
  }
  if (typeof (value as unknown as Readable).on === 'function') {
    return true;
  }

  return false;
});

export const zodFileStreamSchema = z.object({
  stream: readableEsqueSchema,
  name: z.string(),
  type: z.string(),
});

export const zodFileSchema = z.union([
  z.instanceof(File),
  zodFileStreamSchema.transform(async (input) => {
    const chunks: Buffer[] = [];
    for await (const chunk of input.stream) {
      chunks.push(chunk);
    }

    return new File(chunks, input.name, {
      type: input.type,
    });
  }),
]);
