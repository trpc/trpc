import { StandardSchemaV1Error } from '../vendor/standard-schema-v1/error';
import { type StandardSchemaV1 } from '../vendor/standard-schema-v1/spec';
import { isObject } from './utils';

// zod / typeschema
export type ParserZodEsque<TInput, TParsedInput> = {
  _input: TInput;
  _output: TParsedInput;
};

export type ParserValibotEsque<TInput, TParsedInput> = {
  schema: {
    _types?: {
      input: TInput;
      output: TParsedInput;
    };
  };
};

export type ParserArkTypeEsque<TInput, TParsedInput> = {
  inferIn: TInput;
  infer: TParsedInput;
};

export type ParserStandardSchemaEsque<TInput, TParsedInput> = StandardSchemaV1<
  TInput,
  TParsedInput
>;

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

export type ParserWithInputOutput<TInput, TParsedInput> =
  | ParserZodEsque<TInput, TParsedInput>
  | ParserValibotEsque<TInput, TParsedInput>
  | ParserArkTypeEsque<TInput, TParsedInput>
  | ParserStandardSchemaEsque<TInput, TParsedInput>;

export type Parser = ParserWithInputOutput<any, any> | ParserWithoutInput<any>;

interface ParserCallbackOptions {
  ctx: unknown;
}
export type ParserCallback<
  TOptions extends ParserCallbackOptions,
  TParser extends Parser,
> = (opts: { ctx: TOptions['ctx'] }) => TParser;

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

export type AnyParserOrCallback = Parser | ParserCallback<any, any>;

export type inferParserOrCallback<
  TOptions extends ParserCallbackOptions,
  TParserOrCallback extends Parser | ParserCallback<TOptions, any>,
> =
  TParserOrCallback extends ParserCallback<TOptions, infer $TParser>
    ? inferParser<$TParser>
    : TParserOrCallback extends Parser
      ? inferParser<TParserOrCallback>
      : never;

export type ParseFn<TType> = (value: unknown) => Promise<TType> | TType;
export type ParseFnCallback = {
  [parserWrapper]: true;
  callback: ParserCallback<any, Parser>;
};

export type ParseFnOrCallback<TType> = ParseFn<TType> | ParseFnCallback;

const parserWrapper = Symbol();

export function isParserWrapper(obj: unknown): obj is {
  [parserWrapper]: unknown;
} {
  return isObject(obj) && parserWrapper in obj;
}

export function getParseFn<TType>(
  procedureParser: AnyParserOrCallback,
): ParseFn<TType> | null {
  const parser = procedureParser as any;

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
      return value as TType;
    };
  }

  if ('~standard' in parser) {
    // StandardSchemaEsque
    return async (value) => {
      const result = await parser['~standard'].validate(value);
      if (result.issues) {
        throw new StandardSchemaV1Error(result.issues);
      }
      return result.value;
    };
  }
  return null;
}

export function getParseFnOrWrapper<TType>(
  procedureParser: AnyParserOrCallback,
): ParseFn<TType> | ParseFnCallback {
  const parser = procedureParser;

  const parseFn = getParseFn(procedureParser);
  if (!parseFn && typeof parser === 'function') {
    return {
      [parserWrapper]: true,
      callback: procedureParser as ParserCallback<any, any>,
    };
  }

  throw new Error('Could not find a validator fn');
}
