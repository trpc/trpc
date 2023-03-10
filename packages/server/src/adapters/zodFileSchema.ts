import type { Readable } from 'stream';
import z, { ZodTypeAny } from 'zod';
import { FormDataFileStream } from './node-http/content-type/form-data';

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
    return isFileListEsque(value);
  })
  .transform((value) => value.item(0));

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

type Input<
  // _TStream extends boolean,
  _TMimeType extends string,
  TOptional extends boolean,
> =
  | File
  | FileList
  | {
      stream: Readable;
      name: string;
      type: string;
    }
  | (TOptional extends true ? undefined : never);

type Output<
  // TStream extends boolean,
  TMimeType extends string,
  TOptional extends boolean,
> =
  | {
      name: string;
      mime: TMimeType;
      stream: Readable;
    }
  | (TOptional extends true ? undefined | null : never);

type NonEmptyArray<TTypes> = [TTypes, ...TTypes[]];

export function unstable_createZodFileSchema<
  // TStream extends boolean = false,
  TMimeType extends string = string,
  TOptional extends boolean = false,
>(opts: {
  /**
   * Mime types
   */
  types?: NonEmptyArray<TMimeType>;
  /**
   * Allow not uploading a file
   * @default false
   */
  optional?: TOptional;

  /**
   * @internal
   */
  __context?: 'server' | 'browser';
}): z.ZodType<
  // output
  Output<TMimeType, TOptional>,
  // input
  z.ZodTypeDef,
  Input<TMimeType, TOptional>
> {
  const {
    types,
    optional,

    __context = typeof window === 'undefined' ? 'server' : 'browser',
  } = opts;

  if (__context == 'browser') {
    // Browser gets FileList or File
    const inputs: z.ZodTypeAny[] = [
      optional ? fileEsqueSchema.nullish() : fileEsqueSchema,
      optional ? fileListEsqueSchema : fileListEsqueSchema.refine(Boolean),
    ];

    let schema: z.ZodTypeAny = z.union(inputs as any);
    if (types) {
      schema = schema.refine((file) => {
        return types.includes(file.type);
      }, 'Invalid file type');
    }
    return schema;
  }

  let schema: ZodTypeAny = z.object({
    stream: readableEsqueSchema,
    name: z.string(),
    type: z.string(),
  });

  if (types) {
    schema = schema.refine((input?: FormDataFileStream) => {
      return input ? types.includes(input.type as any) : true;
    }, 'Invalid file type');
  }

  if (optional) {
    schema = schema.optional();
  }

  return schema;
}
