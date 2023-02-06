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

export type ParserCustomValidatorEsque<TInput, TContext> = (
  input: unknown,
) => TInput | Promise<TInput>;

export type ParserYupEsque<TInput> = {
  validateSync: (input: unknown) => TInput;
};
export type ParserWithoutInput<TInput, TContext> =
  | ParserYupEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserCustomValidatorEsque<TInput, TContext>
  | ParserMyZodEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> = ParserZodEsque<
  TInput,
  TParsedInput
>;

export type Parser<TContext> =
  | ParserWithoutInput<any, TContext>
  | ParserWithInputOutput<any, any>;

export type inferParser<TParser extends Parser<any>> =
  TParser extends ParserWithInputOutput<infer $TIn, infer $TOut>
    ? {
        in: $TIn;
        out: $TOut;
      }
    : TParser extends ParserWithoutInput<infer $InOut, infer $Context>
    ? {
        in: $InOut;
        out: $InOut;
      }
    : never;
