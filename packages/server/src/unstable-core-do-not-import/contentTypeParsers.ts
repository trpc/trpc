import { Readable } from 'stream';
import { TRPCError } from './error/TRPCError';
import type { ParserZodEsque } from './parser';

export type UtilityParser<TInput, TOutput> = ParserZodEsque<TInput, TOutput> & {
  parse: (input: unknown) => TOutput;
};

// Should be the same possible types as packages/client/src/links/internals/contentTypes.ts isOctetType

/**
 * When expecting a supported octet type to be passed from the frontend, this parser may be used to validate the type for your procedure
 */
export function parseOctetInput<
  TInput extends File | Blob | Uint8Array,
>(): UtilityParser<TInput, Readable> {
  return {
    _input: null as any as TInput,
    _output: null as any as Readable,
    parse(input: unknown) {
      if (input instanceof Readable) {
        return input;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: `'Parsed input was expected to be a Readable but was: input'`,
      });
    },
  };
}
