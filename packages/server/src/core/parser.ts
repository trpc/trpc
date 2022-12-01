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

export type ParserCustomValidatorEsque<TInput> = (
  input: unknown,
) => TInput | Promise<TInput>;

export type ParserYupEsque<TInput> = {
  validateSync: (input: unknown) => TInput;
};

export type ParserIoTsEsque<TInput, TParsedInput> = {
  _I: TInput;
  _O: TParsedInput;
};

export type ParserMyIoTsEsque<TInput> = {
  decode: (input: unknown) => { right: TInput };
};

export type ParserWithoutInput<TInput> =
  | ParserYupEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserCustomValidatorEsque<TInput>
  | ParserMyZodEsque<TInput>
  | ParserMyIoTsEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> =
  | ParserZodEsque<TInput, TParsedInput>
  | ParserIoTsEsque<TInput, TParsedInput>;

export type Parser = ParserWithoutInput<any> | ParserWithInputOutput<any, any>;

export type inferParser<TParser extends Parser> =
  TParser extends ParserWithInputOutput<infer $TIn, infer $TOut>
    ? {
        in: $TIn;
        out: $TOut;
      }
    : TParser extends ParserWithoutInput<infer $InOut>
    ? {
        in: $InOut;
        out: $InOut;
      }
    : never;
