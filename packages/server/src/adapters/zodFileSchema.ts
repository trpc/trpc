import z, { ZodTypeAny } from 'zod';
import { Overwrite } from '../internals';
import { FormDataFileStream } from './node-http/content-type/form-data';

type Stream = FormDataFileStream['stream'];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

const readableEsqueSchema = z.custom<Stream>((value) => {
  // check if file is is a Stream without importing Stream
  if (!isObject(value)) {
    return false;
  }
  if (typeof (value as unknown as Stream).on === 'function') {
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

type Input<_TMimeType extends string, TOptional extends boolean> =
  | File
  | FileList
  | FormDataFileStream
  | (TOptional extends true ? undefined : never);

type Output<TMimeType extends string, TOptional extends boolean> =
  | Overwrite<FormDataFileStream, { type: TMimeType }>
  | (TOptional extends true ? undefined | null : never);

type NonEmptyArray<TTypes> = [TTypes, ...TTypes[]];

/**
 * Isomorphic File schema that can be used in both the browser and server.
 */
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
   * This only exists for tests to force the context
   * @internal
   */
  __context?: 'server' | 'browser';
}): z.ZodType<
  Output<TMimeType, TOptional>,
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
      schema = schema.refine(
        (file) => {
          return types.includes(file.type);
        },
        (val) => ({
          message: `Invalid file type: ${val.type}`,
        }),
      );
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
