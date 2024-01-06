import { Parser } from '../parser';

export type ParseFn<TType> = (value: unknown) => Promise<TType> | TType;

export function getParseFnInner<TType>(
  procedureParser: Parser,
): ParseFn<TType> | null {
  const parser = procedureParser as any;

  if (typeof parser.parseAsync === 'function') {
    // ParserZodEsque
    return parser.parseAsync.bind(parser);
  }

  if (typeof parser.parse === 'function') {
    // ParserZodEsque
    // ParserValibotEsque (<= v0.12.X)
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

  return null;
}

export function getParseFn<TType>(procedureParser: Parser): ParseFn<TType> {
  const parse = getParseFnInner<TType>(procedureParser);

  if (parse !== null) {
    return parse;
  }

  throw new Error('Could not find a validator fn');
}
