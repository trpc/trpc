import { MaybePromise } from '@trpc/server/types';
import { Parser } from '../parser';
import { GetRawInputOrOutputFn } from './utils';

export type ParseFn<TType> = (opts: {
  getValue: GetRawInputOrOutputFn;
}) => Promise<TType>;

function createParseFn<TOutput>(
  parser: (input: unknown) => MaybePromise<TOutput>,
): ParseFn<TOutput> {
  return async (opts) => {
    const rawInput = await opts.getValue();
    const output = await parser(rawInput);
    return output;
  };
}

export function getParseFn<TType>(procedureParser: Parser): ParseFn<TType> {
  const parser = procedureParser as any;

  if (typeof parser === 'function') {
    // ParserCustomValidatorEsque
    return parser;
  }

  if (typeof parser.parseAsync === 'function') {
    // ParserZodEsque
    return createParseFn(parser.parseAsync.bind(parser));
  }

  if (typeof parser.parse === 'function') {
    // ParserZodEsque
    // ParserValibotEsque (<= v0.12.X)
    return createParseFn(parser.parse.bind(parser));
  }

  if (typeof parser.validateSync === 'function') {
    // ParserYupEsque
    return createParseFn(parser.validateSync.bind(parser));
  }

  if (typeof parser.create === 'function') {
    // ParserSuperstructEsque
    return createParseFn(parser.create.bind(parser));
  }

  if (typeof parser.assert === 'function') {
    // ParserScaleEsque
    return createParseFn((value) => {
      parser.assert(value);
      return value as TType;
    });
  }

  throw new Error('Could not find a validator fn');
}
