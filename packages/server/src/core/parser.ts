import { NodeHTTPRequest } from '../adapters/node-http/types';

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

export type ParserScaleEsque<TInput> = {
  assert(value: unknown): asserts value is TInput;
};

export type ParserWithoutInput<TInput> =
  | ParserYupEsque<TInput>
  | ParserSuperstructEsque<TInput>
  | ParserCustomValidatorEsque<TInput>
  | ParserMyZodEsque<TInput>
  | ParserScaleEsque<TInput>;

export type ParserWithInputOutput<TInput, TParsedInput> = ParserZodEsque<
  TInput,
  TParsedInput
>;

export type Parser =
  | ParserWithoutInput<any>
  | ParserWithInputOutput<any, any>
  | Experimental_ParseStrategy<any>;

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
    : TParser extends Experimental_ParseStrategy<infer $TParser>
    ? inferParser<$TParser>
    : never;

//
//

export const strategyMarker = Symbol('input-strategy');
export type StrategyMarker = typeof strategyMarker;

export type Experimental_ParseStrategy<
  TParser extends ParserWithInputOutput<any, any>,
> = {
  _strategy: StrategyMarker;
  _loadFromRequest: (
    req: NodeHTTPRequest,
  ) => Promise<inferParser<TParser>['in']>;
  _parser: TParser;
};
