import type { AnyRouter, inferRouterError } from '@trpc/server';
import type {
  TRPCResponse,
  TRPCResponseMessage,
  TRPCResultMessage,
} from '@trpc/server/rpc';
import { isObject } from '../internals/isObject';
import type { TRPCClientRuntime } from '../links';

// FIXME:
// - the generics here are probably unnecessary
// - the RPC-spec could probably be simplified to combine HTTP + WS
/** @internal */
function transformResultInner<TRouter extends AnyRouter, TOutput>(
  response:
    | TRPCResponse<TOutput, inferRouterError<TRouter>>
    | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>,
  runtime: TRPCClientRuntime,
) {
  if ('error' in response) {
    const error = runtime.transformer.deserialize(
      response.error,
    ) as inferRouterError<TRouter>;
    return {
      ok: false,
      error: {
        ...response,
        error,
      },
    } as const;
  }

  const result = {
    ...response.result,
    ...((!response.result.type || response.result.type === 'data') && {
      type: 'data',
      data: runtime.transformer.deserialize(response.result.data),
    }),
  } as TRPCResultMessage<TOutput>['result'];
  return { ok: true, result } as const;
}

class TransformResultError extends Error {
  constructor() {
    super('Unable to transform response from server');
  }
}

/**
 * Transforms and validates that the result is a valid TRPCResponse
 * @internal
 */
export function transformResult<TRouter extends AnyRouter, TOutput>(
  response:
    | TRPCResponse<TOutput, inferRouterError<TRouter>>
    | TRPCResponseMessage<TOutput, inferRouterError<TRouter>>,
  runtime: TRPCClientRuntime,
): ReturnType<typeof transformResultInner> {
  let result: ReturnType<typeof transformResultInner>;
  try {
    // Use the data transformers on the JSON-response
    result = transformResultInner(response, runtime);
  } catch (err) {
    throw new TransformResultError();
  }

  // check that output of the transformers is a valid TRPCResponse
  if (
    !result.ok &&
    (!isObject(result.error.error) ||
      typeof result.error.error.code !== 'number')
  ) {
    throw new TransformResultError();
  }
  if (result.ok && !isObject(result.result)) {
    throw new TransformResultError();
  }
  return result;
}
