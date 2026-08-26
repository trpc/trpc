import type { ParserZodEsque } from '../parser';

/**
 * @internal
 */
export type UtilityParser<TInput, TOutput> = ParserZodEsque<TInput, TOutput> & {
  parse: (input: unknown) => TOutput;
};

// Should be the same possible types as packages/client/src/links/internals/contentTypes.ts isOctetType

/**
 * @internal
 *
 * File is only available from Node19+ but it always extends Blob so we can use that as a type until we eventually drop Node18
 */
export interface FileLike extends Blob {
  readonly name: string;
}

/**
 * @internal
 */
export type OctetInput = Blob | Uint8Array | FileLike;

export const octetInputParser: UtilityParser<OctetInput, ReadableStream> = {
  _input: null as any as OctetInput,
  _output: null as any as ReadableStream,
  parse(input) {
    if (input instanceof ReadableStream) {
      return input;
    }

    throw new Error(
      `Parsed input was expected to be a ReadableStream but was: ${typeof input}`,
    );
  },
};
