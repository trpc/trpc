import { TRPCError } from '../error/TRPCError';
import type { ParserZodEsque } from '../parser';

export type UtilityParser<TInput, TOutput> = ParserZodEsque<TInput, TOutput> & {
  parse: (input: unknown) => TOutput;
};

// Should be the same possible types as packages/client/src/links/internals/contentTypes.ts isOctetType

/**
 * File is only available from Node19+ but it always extends Blob so we can use that as a type until we eventually drop Node18
 */
interface FileLike extends Blob {
  readonly name: string;
}

/**
 * When expecting a supported octet type to be passed from the frontend, this parser may be used to validate the type for your procedure. Note: the output is always a `Readable` stream.
 */
export function parseOctetInput<
  TInput extends Blob | Uint8Array | FileLike,
>(): UtilityParser<TInput, ReadableStream> {
  return {
    _input: null as any as TInput,
    _output: null as any as ReadableStream,
    parse(input: unknown) {
      if (input instanceof ReadableStream) {
        return input;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: `Parsed input was expected to be a ReadableStream but was: ${typeof input}`,
      });
    },
  };
}
