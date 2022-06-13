import { Parser } from '../parser';

export type ParseFn<T> = (value: unknown) => T | Promise<T>;

export function getParseFn<T>(procedureParser: Parser): ParseFn<T> {
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

  throw new Error('Could not find a validator fn');
}

/**
 * @deprecated only for backwards compat
 * @internal
 */
export function getParseFnOrPassThrough<T>(
  procedureParser: Parser | undefined,
): ParseFn<T> {
  if (!procedureParser) {
    return (v) => v as T;
  }
  return getParseFn(procedureParser);
}
