import { Parser } from '../parser';

export type ParseFn<TType> = (value: unknown) => TType | Promise<TType>;

export function getParseFn<TType>(procedureParser: Parser): ParseFn<TType> {
  const parser = procedureParser as any;

  if (typeof parser === 'function') {
    // ProcedureParserCustomValidatorEsque
    return parser;
  }

  if (typeof parser.parseAsync === 'function') {
    // ProcedureParserZodEsque
    return parser.parseAsync.bind(parser);
  }

  if (typeof parser.parse === 'function') {
    // ProcedureParserZodEsque
    return parser.parse.bind(parser);
  }

  if (typeof parser.validateSync === 'function') {
    // ProcedureParserYupEsque
    return parser.validateSync.bind(parser);
  }

  if (typeof parser.create === 'function') {
    // ProcedureParserSuperstructEsque
    return parser.create.bind(parser);
  }

  if (typeof parser.assert === 'function') {
    // ParserScaleEsque
    return (value) => {
      parser.assert(value);
      return value as TType;
    };
  }

  throw new Error('Could not find a validator fn');
}

/**
 * @deprecated only for backwards compat
 * @internal
 */
export function getParseFnOrPassThrough<TType>(
  procedureParser: Parser | undefined,
): ParseFn<TType> {
  if (!procedureParser) {
    return (v) => v as TType;
  }
  return getParseFn(procedureParser);
}
