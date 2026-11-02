import type { ParserZodEsque } from '../parser';

/**
 * A validator tRPC ships for a special input type.
 * @internal
 */
export type UtilityParser<TInput, TOutput> = ParserZodEsque<TInput, TOutput> & {
  parse: (input: unknown) => TOutput;
};

// Should be the same possible types as packages/client/src/links/internals/contentTypes.ts isOctetType

/**
 * A `File`. Node 18 has no `File` type, but a `File` is always a `Blob`.
 * @internal
 */
export interface FileLike extends Blob {
  readonly name: string;
}

/**
 * The binary inputs a client can send with `octetInputParser`.
 * @internal
 */
export type OctetInput = Blob | Uint8Array | FileLike;

/**
 * An input validator for binary data, such as a `File` or `Blob`. The
 * resolver gets the input as a `ReadableStream`.
 * @example
 * ```ts
 * t.procedure.input(octetInputParser).mutation(({ input }) => input);
 * ```
 * @see https://trpc.io/docs/server/non-json-content-types#file-and-other-binary-type-inputs
 */
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
