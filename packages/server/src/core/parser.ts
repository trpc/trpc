// zod / @decs/typeschema
export type ParserZodEsque<TInput, TParsedInput> = {
  _input: TInput;
  _output: TParsedInput;
};

export type ParserMyZodEsque<TInput> = {
  parse: (input: any) => TInput;
};

export type ParserArkTypeEsque<TInput> = {
  assert: (input: unknown) => TInput;
  node: any;
};

export type ParserSuperstructEsque<TInput> = {
  create: (input: unknown) => TInput;
};

export type RuntypesEsque<TInput> = {
  check: (input: any) => TInput;
};

export type ParserCustomValidatorEsque<TInput> = (
  input: unknown,
) => Promise<TInput> | TInput;

export type ParserYupEsque<TInput> = {
  validateSync: (input: unknown) => TInput;
};

export type ParserScaleEsque<TInput> = {
  assert(value: unknown): asserts value is TInput;
  decode(array: Uint8Array): any;
};

export type ParserWithoutInput<TInput> =
  // if you play with this: try toggling the below on and off
  // | ParserCustomValidatorEsque<TInput>
  | ParserMyZodEsque<TInput>
  | ParserScaleEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserYupEsque<TInput>
  | ParserArkTypeEsque<TInput>
  | RuntypesEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> = ParserZodEsque<
  TInput,
  TParsedInput
>;

export type Parser = ParserWithInputOutput<any, any> | ParserWithoutInput<any>;

export type ParserCallback<TContext, TParser extends Parser> = (opts: {
  input: unknown;
  ctx: TContext;
}) => TParser;

export type inferParser<TParser extends Parser> =
  TParser extends ParserWithInputOutput<infer $TIn, infer $TOut>
    ? {
        in: Awaited<$TIn>;
        out: Awaited<$TOut>;
      }
    : TParser extends ParserWithoutInput<infer $InOut>
    ? {
        in: Awaited<$InOut>;
        out: Awaited<$InOut>;
      }
    : never;

// export type inferParser<TParser extends Parser | ParserCallback<any, any>> =
//   TParser extends ParserCallback<any, infer $Parser>
//     ? inferParserInner<$Parser>
//     : TParser extends Parser
//     ? inferParserInner<TParser>
//     : never;
