// zod
export interface ParserZodEsque<TInput, TParsedInput, TError> {
  _input: TInput;
  _output: TParsedInput;
  safeParseAsync: (input: unknown) => Promise<
    | {
        success: true;
        data: TParsedInput;
      }
    | {
        success: false;
        error: TError;
      }
  >;
}

export interface ParserTypeschemaEsque<TInput, TParsedInput> {
  _input: TInput;
  _output: TParsedInput;
}

export interface ParserValibotEsque<TInput, TParsedInput> {
  schema: {
    _types?: {
      input: TInput;
      output: TParsedInput;
    };
  };
}

export interface ParserArkTypeEsque<TInput, TParsedInput> {
  inferIn: TInput;
  infer: TParsedInput;
}

export interface ParserMyZodEsque<TInput> {
  parse: (input: any) => TInput;
}

export interface ParserSuperstructEsque<TInput> {
  create: (input: unknown) => TInput;
}

export interface ParserYupEsque<TInput> {
  validateSync: (input: unknown) => TInput;
}

export interface ParserScaleEsque<TInput> {
  assert(value: unknown): asserts value is TInput;
}

export type ParserWithoutInput<TInput> =
  | ParserMyZodEsque<TInput>
  | ParserScaleEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserYupEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> =
  | ParserTypeschemaEsque<TInput, TParsedInput>
  | ParserValibotEsque<TInput, TParsedInput>
  | ParserArkTypeEsque<TInput, TParsedInput>;

export type ParserWithError<TInput, TParsedInput, TError> = ParserZodEsque<
  TInput,
  TParsedInput,
  TError
>;

export type Parser =
  | ParserWithInputOutput<any, any>
  | ParserWithoutInput<any>
  | ParserWithError<any, any, any>;

interface ParserDef {
  in: any;
  out: any;
  error: any;
}

const parserMarker = 'parserMarker' as 'parserMarker' & {
  __brand: 'parserMarker';
};

export type inferParser<TParser extends Parser> =
  TParser extends ParserWithError<infer $In, infer $Out, infer $Err>
    ? {
        in: $In;
        out: $Out;
        error: $Err;
      }
    : TParser extends ParserWithInputOutput<infer $In, infer $TOut>
      ? {
          in: $In;
          out: $TOut;
          error: never;
        }
      : TParser extends ParserWithoutInput<infer $InOut>
        ? {
            in: $InOut;
            out: $InOut;
            error: never;
          }
        : never;

type TypedOKResult<TDef extends ParserDef> = [
  true,
  TDef['out'],
  typeof parserMarker,
];
type TypedErrorResult<TDef extends ParserDef> = [
  false,
  TDef['error'],
  typeof parserMarker,
];

type TypedResult<TDef extends ParserDef> =
  | TypedOKResult<TDef>
  | TypedErrorResult<TDef>;

export function isTypedParserResult(v: unknown): v is TypedResult<any> {
  return Array.isArray(v) && v[2] === parserMarker;
}

export type ParseFn<TDef extends ParserDef> = (
  value: unknown,
) => Promise<TypedResult<TDef>> | TDef['out'];

export function getParseFn(procedureParser: Parser): ParseFn<{
  in: unknown;
  out: unknown;
  error: unknown;
}> {
  const parser = procedureParser as any;

  if (typeof parser === 'function' && typeof parser.assert === 'function') {
    // ParserArkTypeEsque - arktype schemas shouldn't be called as a function because they return a union type instead of throwing
    return parser.assert.bind(parser);
  }

  if (typeof parser.safeParseAsync === 'function') {
    // ParserZodEsque
    return async (value) => {
      const result = await (
        parser as ParserZodEsque<any, any, any>
      ).safeParseAsync(value);
      if (result.success) {
        return [true, result.data, parserMarker] as const;
      }
      return [false, result.error, parserMarker] as const;
    };
  }

  if (typeof parser.parseAsync === 'function') {
    // ParserZodEsque
    return parser.parseAsync.bind(parser);
  }

  if (typeof parser.parse === 'function') {
    // ParserZodEsque
    // ParserValibotEsque (< v0.13.0)
    return parser.parse.bind(parser);
  }

  if (typeof parser.validateSync === 'function') {
    // ParserYupEsque
    return parser.validateSync.bind(parser);
  }

  if (typeof parser.create === 'function') {
    // ParserSuperstructEsque
    return parser.create.bind(parser);
  }

  if (typeof parser.assert === 'function') {
    // ParserScaleEsque
    return (value) => {
      parser.assert(value);
      return value;
    };
  }

  throw new Error('Could not find a validator fn');
}
