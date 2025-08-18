import { StandardSchemaV1Error } from '../vendor/standard-schema-v1/error';
import { type StandardSchemaV1 } from '../vendor/standard-schema-v1/spec';

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

export type ParserCustomValidatorEsque<TInput> = (
  input: unknown,
) => Promise<TInput> | TInput;

export type ParserYupEsque<TInput> = {
  validateSync: (input: unknown) => TInput;
};

export type ParserScaleEsque<TInput> = {
  assert(value: unknown): asserts value is TInput;
};

export type ParserWithoutInput<TInput> =
  | ParserCustomValidatorEsque<TInput>
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

export type inferParser<TParser extends Parser> =
  TParser extends ParserStandardSchemaEsque<infer $TIn, infer $TOut>
    ? {
        in: $TIn;
        out: $TOut;
      }
    : TParser extends ParserWithInputOutput<infer $TIn, infer $TOut>
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

export type ParseFn<TType> = (value: unknown) => Promise<TType> | TType;

export function getParseFn<TType>(procedureParser: Parser): ParseFn<TType> {
  const parser = procedureParser as any;
  const isStandardSchema = '~standard' in parser;

  if (typeof parser === 'function' && typeof parser.assert === 'function') {
    // ParserArkTypeEsque - arktype schemas shouldn't be called as a function because they return a union type instead of throwing
    return parser.assert.bind(parser);
  }

  if (typeof parser === 'function' && !isStandardSchema) {
    // ParserValibotEsque (>= v0.31.0)
    // ParserCustomValidatorEsque - note the check for standard-schema conformance - some libraries like `effect` use function schemas which are *not* a "parse" function.
    return parser;
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
      return value as TType;
    };
  }

  if (isStandardSchema) {
    // StandardSchemaEsque
    return async (value) => {
      const result = await parser['~standard'].validate(value);
      if (result.issues) {
        throw new StandardSchemaV1Error(result.issues);
      }
      return result.value;
    };
  }

  throw new Error('Could not find a validator fn');
}
