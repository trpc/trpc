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

/**
 * This is a hack to check if a value is a File in the browser
 */
const fileEsqueSchema = z.custom<File>((value) => {
  if (!isObject(value)) {
    return false;
  }
  if (typeof (value as unknown as File).type === 'string') {
    return true;
  }
  return false;
});

function isFileListEsque(value: unknown): value is FileList {
  return (
    isObject(value) && typeof (value as unknown as FileList).item === 'function'
  );
}

/**
 * This is a hack to check if a value is a FileList in the browser
 * Returns the first item file 🤷‍♂️
 */
const fileListEsqueSchema = z
  .custom<FileList>((value) => {
    return isFileListEsque(value) && value.item(0);
  })
  .transform((value) => value.item(0) as File);

export const unstable_zodFileStreamSchema = z.object({
  stream: readableEsqueSchema,
  name: z.string(),
  type: z.string(),
});

/**
 * Isomorphic File schema.
 * It will accept a File, FileList, or a ReadableStream and return a File
 */
export const unstable_zodFileSchema = z.union([
  fileEsqueSchema,
  fileListEsqueSchema,
  unstable_zodFileStreamSchema.transform(async (input) => {
    const chunks: Buffer[] = [];
    for await (const chunk of input.stream) {
      chunks.push(chunk);
    }

    return new File(chunks, input.name, {
      type: input.type,
    });
  }),
]);

export const unstable_zodFileSchemaOptional = z
  .union([
    unstable_zodFileSchema,
    z
      .custom<FileList>(isFileListEsque)
      .transform((value) => value.item(0) ?? undefined),
  ])
  .optional();
