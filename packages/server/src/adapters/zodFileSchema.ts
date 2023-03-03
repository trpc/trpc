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

export const fileEsqueSchema = z.custom<File>((value) => {
  if (!isObject(value)) {
    return false;
  }
  if (typeof (value as unknown as File).type === 'string') {
    return true;
  }
  return false;
});

export const fileListEsqueSchema = z
  .custom<FileList>((value) => {
    if (!isObject(value)) {
      return false;
    }
    if (
      typeof (value as unknown as FileList).item === 'function' &&
      (value as unknown as FileList).item(0)
    ) {
      return true;
    }
    return false;
  })
  .transform((value) => value.item(0) as File);

export const zodFileStreamSchema = z.object({
  stream: readableEsqueSchema,
  name: z.string(),
  type: z.string(),
});

export const zodFileSchema = z.union([
  fileEsqueSchema,
  fileListEsqueSchema,
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
