/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AnyRouter } from '../core';
import { TRPCError } from '../error/TRPCError';
import { getCauseFromUnknown } from '../error/utils';
import { CombinedDataTransformer } from '../transformer';
import { MaybePromise } from '../types';
import { HTTPRequest } from './internals/types';

type GetInputs = (opts: {
  req: HTTPRequest;
  isBatchCall: boolean;
  router: AnyRouter;
}) => MaybePromise<Record<number, unknown>>;

type BodyResult = { ok: true; data: unknown } | { ok: false; error: TRPCError };

export type BaseContentTypeHandler<TOptions> = {
  isMatch(opts: TOptions): boolean;
  getBody: (opts: TOptions) => MaybePromise<BodyResult>;
  getInputs: GetInputs;
};

function getRawProcedureInputOrThrow(req: HTTPRequest) {
  try {
    if (req.method === 'GET') {
      if (!req.query.has('input')) {
        return undefined;
      }
      const raw = req.query.get('input');
      return JSON.parse(raw!);
    }
    if (typeof req.body === 'string') {
      // A mutation with no inputs will have req.body === ''
      return req.body.length === 0 ? undefined : JSON.parse(req.body);
    }
    return req.body;
  } catch (err) {
    throw new TRPCError({
      code: 'PARSE_ERROR',
      cause: getCauseFromUnknown(err),
    });
  }
}

const deserializeInputValue = (
  rawValue: unknown,
  transformer: CombinedDataTransformer,
) => {
  return typeof rawValue !== 'undefined'
    ? transformer.input.deserialize(rawValue)
    : rawValue;
};

export const getJsonContentTypeInputs: GetInputs = ({
  req,
  isBatchCall,
  router,
}) => {
  const rawInput = getRawProcedureInputOrThrow(req);
  const transformer = router._def._config.transformer;

  if (!isBatchCall) {
    return {
      0: deserializeInputValue(rawInput, transformer),
    };
  }

  /* istanbul ignore if  */
  if (
    rawInput == null ||
    typeof rawInput !== 'object' ||
    Array.isArray(rawInput)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '"input" needs to be an object when doing a batch call',
    });
  }
  const input: Record<number, unknown> = {};
  for (const key in rawInput) {
    const k = key as any as number;
    const rawValue = rawInput[k];

    const value = deserializeInputValue(rawValue, transformer);

    input[k] = value;
  }

  return input;
};
