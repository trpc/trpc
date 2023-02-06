import { Parser } from '../parser';

export type ParseFnOptions<TContext> = {
  ctx: TContext;
};
export type ParseFn<TType, TContext> = (
  value: unknown,
  opts: {
    ctx: TContext;
  },
) => TType | Promise<TType>;

export function getParseFn<TType>(
  procedureParser: Parser<unknown>,
): ParseFn<TType, unknown> {
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
export function getParseFnOrPassThrough<TType>(
  procedureParser: Parser<any> | undefined,
): ParseFn<TType, undefined> {
  if (!procedureParser) {
    return (v) => v as TType;
  }
  return getParseFn(procedureParser);
}
