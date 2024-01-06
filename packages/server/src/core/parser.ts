// zod / @decs/typeschema
export type ParserZodEsque<TInput, TParsedInput> = {
  _input: TInput;
  _output: TParsedInput;
};

export type ParserMyZodEsque<TInput> = {
  parse: (input: any) => TInput;
};

export type ParserSuperstructEsque<TInput> = {
  create: (input: unknown) => TInput;
};
export type ParserYupEsque<TInput> = {
  validateSync: (input: unknown) => TInput;
};

export type ParserScaleEsque<TInput> = {
  assert(value: unknown): asserts value is TInput;
};

export type ParserWithoutInput<TInput> =
  | ParserMyZodEsque<TInput>
  | ParserScaleEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserYupEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> = ParserZodEsque<
  TInput,
  TParsedInput
>;

export type Parser = ParserWithInputOutput<any, any> | ParserWithoutInput<any>;

export type inferParserInner<TParser extends Parser> =
  TParser extends ParserWithInputOutput<infer $TIn, infer $TOut>
    ? { in: Awaited<$TIn>; out: Awaited<$TOut> }
    : TParser extends ParserWithoutInput<infer $InOut>
    ? {
        in: Awaited<$InOut>;
        out: Awaited<$InOut>;
      }
    : never;

export type ParserCallback<TParam, TContext, TCallbackResult> = (
  opts: {
    ctx: TContext;
  } & TParam,
) => TCallbackResult;

export type InputParserCallback<TContext, TCallbackResult> = ParserCallback<
  { input: unknown },
  TContext,
  TCallbackResult
>;

export type OutputParserCallback<TContext, TCallbackResult> = ParserCallback<
  { output: unknown },
  TContext,
  TCallbackResult
>;

export type inferParser<
  TParser extends Parser | ParserCallback<any, any, any>,
> = TParser extends ParserCallback<any, any, infer $CallbackResult>
  ? Awaited<$CallbackResult> extends Parser
    ? inferParserInner<Awaited<$CallbackResult>>
    : {
        in: Awaited<$CallbackResult>;
        out: Awaited<$CallbackResult>;
      }
  : TParser extends Parser
  ? inferParserInner<TParser>
  : never;
