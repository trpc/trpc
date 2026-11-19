/* oxlint-disable typescript/no-non-null-assertion */
import {
  isObservable,
  observableToAsyncIterable,
} from '../../observable/observable';
import { getDefaultErrorShape } from '../error/formatter';
import { getErrorShape } from '../error/getErrorShape';
import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import type { ProcedureType } from '../procedure';
import {
  type AnyRouter,
  type inferRouterContext,
  type inferRouterError,
} from '../router';
import type { TRPCResponse } from '../rpc';
import { isPromise, jsonlStreamProducer } from '../stream/jsonl';
import { sseHeaders, sseStreamProducer } from '../stream/sse';
import { transformTRPCResponse } from '../transformer';
import type { CombinedDataTransformer } from '../transformer';
import {
  abortSignalsAnyPonyfill,
  isAsyncIterable,
  isObject,
  run,
} from '../utils';
import { getAcceptHeader, getLastEventId, getRequestInfo } from './contentType';
import { getHTTPStatusCode } from './getHTTPStatusCode';
import { urlPathToProcedurePath } from './pathSeparator';
import { pipelineCalls, pipelineLimitsOf } from './pipeline/server';
import type { PipelineCallRun, PipelineRuns } from './pipeline/server';
import { isPipelineNotRun, markPipelineNotRun } from './pipeline/wire';
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
  TRPCRequestInfo,
} from './types';

/**
 * `decodeURIComponent` throws a plain `URIError` on malformed escape sequences,
 * which would otherwise surface as an `INTERNAL_SERVER_ERROR` even though the
 * request itself is at fault
 */
function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid URL-encoding in path "${path}"`,
      cause,
    });
  }
}

function errorToAsyncIterable(err: TRPCError): AsyncIterable<never> {
  return run(async function* () {
    throw err;
  });
}
type HTTPMethods =
  | 'GET'
  | 'POST'
  | 'HEAD'
  | 'OPTIONS'
  | 'PUT'
  | 'DELETE'
  | 'PATCH';

function combinedAbortController(signal: AbortSignal) {
  const controller = new AbortController();
  const combinedSignal = abortSignalsAnyPonyfill([signal, controller.signal]);
  return {
    signal: combinedSignal,
    controller,
  };
}

/**
 * A client that leaves may only cancel the response body, without aborting
 * the request's signal, and the procedures streaming into it wait on that.
 */
function abortOnCancel(
  stream: ReadableStream<Uint8Array>,
  controller: AbortController,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  return new ReadableStream({
    async pull(enqueuer) {
      const chunk = await reader.read();
      if (chunk.done) {
        enqueuer.close();
      } else {
        enqueuer.enqueue(chunk.value);
      }
    },
    cancel(reason) {
      controller.abort();
      return reader.cancel(reason);
    },
  });
}

const TYPE_ACCEPTED_METHOD_MAP: Record<ProcedureType, HTTPMethods[]> = {
  mutation: ['POST'],
  query: ['GET'],
  subscription: ['GET'],
};
const TYPE_ACCEPTED_METHOD_MAP_WITH_METHOD_OVERRIDE: Record<
  ProcedureType,
  HTTPMethods[]
> = {
  // never allow GET to do a mutation
  mutation: ['POST'],
  query: ['GET', 'POST'],
  subscription: ['GET', 'POST'],
};

interface ResolveHTTPRequestOptions<
  TRouter extends AnyRouter,
> extends HTTPBaseHandlerOptions<TRouter, Request> {
  createContext: ResolveHTTPRequestOptionsContextFn<TRouter>;
  req: Request;
  path: string;
  /**
   * If the request had an issue before reaching the handler
   */
  error: TRPCError | null;
}

function initResponse<TRouter extends AnyRouter, TRequest>(initOpts: {
  ctx: inferRouterContext<TRouter> | undefined;
  info: TRPCRequestInfo | undefined;
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
  untransformedJSON:
    | TRPCResponse<unknown, inferRouterError<TRouter>>
    | TRPCResponse<unknown, inferRouterError<TRouter>>[]
    | null;
  /**
   * errors aligned with `untransformedJSON` by index; entries are `undefined`
   * for successful responses
   */
  errors: (TRPCError | undefined)[];
  headers: Headers;
}) {
  const {
    ctx,
    info,
    responseMeta,
    untransformedJSON,
    errors = [],
    headers,
  } = initOpts;

  const definedErrors = errors.filter((error): error is TRPCError =>
    Boolean(error),
  );

  let status = untransformedJSON
    ? getHTTPStatusCode(untransformedJSON, errors)
    : 200;

  const eagerGeneration = !untransformedJSON;
  const data = eagerGeneration
    ? []
    : Array.isArray(untransformedJSON)
      ? untransformedJSON
      : [untransformedJSON];

  const meta =
    responseMeta?.({
      ctx,
      info,
      paths: info?.calls.map((call) => call.path),
      data,
      errors: definedErrors,
      eagerGeneration,
      type:
        info?.calls.find((call) => call.procedure?._def.type)?.procedure?._def
          .type ?? 'unknown',
    }) ?? {};

  if (meta.headers) {
    if (meta.headers instanceof Headers) {
      for (const [key, value] of meta.headers.entries()) {
        headers.append(key, value);
      }
    } else {
      /**
       * @deprecated, delete in v12
       */
      for (const [key, value] of Object.entries(meta.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else if (typeof value === 'string') {
          headers.set(key, value);
        }
      }
    }
  }
  if (meta.status) {
    status = meta.status;
  }

  return {
    status,
  };
}

function caughtErrorToData<TRouter extends AnyRouter>(
  cause: unknown,
  errorOpts: {
    opts: Pick<
      ResolveHTTPRequestOptions<TRouter>,
      'onError' | 'req' | 'router'
    >;
    ctx: inferRouterContext<TRouter> | undefined;
    type: ProcedureType | 'unknown';
    path?: string;
    input?: unknown;
  },
) {
  const { router, req, onError } = errorOpts.opts;
  const error = getTRPCErrorFromUnknown(cause);
  onError?.({
    error,
    path: errorOpts.path,
    input: errorOpts.input,
    ctx: errorOpts.ctx,
    type: errorOpts.type,
    req,
  });
  const untransformedJSON = {
    error: getErrorShape({
      config: router._def._config,
      error,
      type: errorOpts.type,
      path: errorOpts.path,
      input: errorOpts.input,
      ctx: errorOpts.ctx,
    }),
  };
  const transformedJSON = transformTRPCResponse(
    router._def._config,
    untransformedJSON,
  );
  const body = JSON.stringify(transformedJSON);
  return {
    error,
    untransformedJSON,
    body,
  };
}

/**
 * Check if a value is a stream-like object
 * - if it's an async iterable
 * - if it's an object with async iterables or promises
 */
function isDataStream(v: unknown) {
  if (!isObject(v)) {
    return false;
  }

  if (isAsyncIterable(v)) {
    return true;
  }

  return (
    Object.values(v).some(isPromise) || Object.values(v).some(isAsyncIterable)
  );
}

type ResultTuple<T> = [undefined, T] | [TRPCError, undefined];

/**
 * A value of a pipelined batch's response, serialized once: what is checked
 * is what is sent, so what serializes differently each time, such as a
 * getter that changes, can't pass and then fail the response
 */
interface SentValue {
  /** As it was made: for `responseMeta`, and for a stream's data */
  value: unknown;
  /**
   * The JSON of what the transformer made of it, as it was checked.
   * `undefined` for what JSON writes nothing for, such as `undefined`
   */
  json: string | undefined;
}

/** An error shape of a pipelined batch's response, serialized once */
interface SentShape {
  /** As it was made: for `responseMeta` */
  value: unknown;
  /** The JSON of what the transformer made of it, as it was checked */
  json: string;
  /**
   * The default shape of the same error, of strings and numbers only, marked
   * as `value` is: what a stream sends if the transformer can't read `json`
   * back
   */
  plain: unknown;
}

/**
 * `value` serialized once, for a pipelined batch's response. Throws what
 * serializing it throws, such as for a `BigInt`. Nothing is read back
 */
function sendable(
  transformer: CombinedDataTransformer['output'],
  value: unknown,
): SentValue {
  return { value, json: JSON.stringify(transformer.serialize(value)) };
}

/** What a response that doesn't stream sends of a value: its checked JSON */
function sentOf(sent: SentValue | SentShape): unknown {
  return sent.json === undefined ? undefined : JSON.parse(sent.json);
}

/**
 * An error shape made and serialized once, or `null` if making or
 * serializing it throws, such as for a getter of the formatter's, or if JSON
 * writes nothing for it: a response has an error there
 */
function trySendableShape(opts: {
  transformer: CombinedDataTransformer['output'];
  shape: () => unknown;
  plain: unknown;
}): SentShape | null {
  try {
    const shape = opts.shape();
    const { json } = sendable(opts.transformer, shape);
    return json === undefined
      ? null
      : { value: shape, json, plain: opts.plain };
  } catch {
    return null;
  }
}

/**
 * Whether an error shape, as it is sent, has the mark of a call refused
 * before it ran: a shape with a `toJSON` of its own, or of its `data`, can
 * write JSON without it. If the transformer can't read the JSON back, which
 * a server need not do, it is taken to have it, as marked
 */
function carriesNotRun(
  transformer: CombinedDataTransformer['output'],
  shape: SentShape,
) {
  try {
    const read: unknown = transformer.deserialize(JSON.parse(shape.json));
    return isObject(read) && isPipelineNotRun(read['data']);
  } catch {
    return true;
  }
}

/** Stands for JSON that the transformer doesn't read back to the same */
const notReadBack = Symbol();

/**
 * Checked JSON read back through the transformer, for a stream to serialize
 * again: only if what it reads serializes to the same JSON. A server need
 * not read back what only its clients read, so its transformer can fail to,
 * or read it as other data
 */
function readBack(
  transformer: CombinedDataTransformer['output'],
  json: string,
): unknown {
  try {
    const value: unknown = transformer.deserialize(JSON.parse(json));
    return JSON.stringify(transformer.serialize(value)) === json
      ? value
      : notReadBack;
  } catch {
    return notReadBack;
  }
}

/**
 * The data of a run as a stream sends it. The stream serializes what it sends
 * itself, so it gets the checked JSON read back through the transformer,
 * which serializes to the same again: not the data as it was made, which
 * could serialize differently the second time. If the transformer doesn't
 * read it back to the same, the data as it was made, as a stream sends any
 * other call's
 */
function streamedValue(
  transformer: CombinedDataTransformer['output'],
  sent: SentValue,
): SentValue {
  if (sent.json === undefined) {
    return sent;
  }
  const value = readBack(transformer, sent.json);
  return value === notReadBack ? sent : { value, json: sent.json };
}

/**
 * An error shape as a stream sends it: the checked JSON read back through
 * the transformer, as for data. If the transformer doesn't read it back to
 * the same, the default shape of the same error, which serializes to the
 * same every time
 */
function streamedShape(
  transformer: CombinedDataTransformer['output'],
  shape: SentShape,
): unknown {
  const value = readBack(transformer, shape.json);
  return value === notReadBack ? shape.plain : value;
}

/** The runs of a call that runs for every item, as far as they are ready */
type PipelineItemsNode = Awaited<PipelineRuns<SentShape, SentValue>>;

/**
 * The runs of a call for every item, for a response that streams: the items
 * of each level, and each run, are values of their own, so each arrives when
 * it is ready. `outcome` makes what a run's outcome is in it.
 */
function streamedItems(
  node: PipelineItemsNode,
  outcome: (
    envelope: Exclude<PipelineItemsNode, { items: unknown }>,
  ) => unknown,
): unknown {
  if (!('items' in node)) {
    return outcome(node);
  }
  const items: Record<string, Promise<unknown>> = {};
  for (const [index, item] of node.items.entries()) {
    items[index] = item.then((it) => streamedItems(it, outcome));
  }
  // A value of its own: the stream only looks for them one level down
  return { items: Promise.resolve(items) };
}

/**
 * The runs of a call for every item, for a response that doesn't stream,
 * once every run is done. `outcome` makes what a run's outcome is in it.
 */
async function settledItems(
  node: PipelineItemsNode,
  outcome: (
    envelope: Exclude<PipelineItemsNode, { items: unknown }>,
  ) => unknown,
): Promise<unknown> {
  if (!('items' in node)) {
    return outcome(node);
  }
  const items: Record<string, unknown> = {};
  for (const [index, item] of node.items.entries()) {
    items[index] = await settledItems(await item, outcome);
  }
  return { items };
}

/**
 * Handles a Fetch API `Request` for a router and returns its `Response`.
 * Every adapter uses it; call it to write your own.
 */
export async function resolveResponse<TRouter extends AnyRouter>(
  opts: ResolveHTTPRequestOptions<TRouter>,
): Promise<Response> {
  const { router, req } = opts;
  const headers = new Headers([['vary', 'trpc-accept, accept']]);
  const config = router._def._config;

  const url = new URL(req.url);

  if (req.method === 'HEAD') {
    // can be used for lambda warmup
    return new Response(null, {
      status: 204,
    });
  }

  const allowBatching = opts.allowBatching ?? opts.batching?.enabled ?? true;
  const allowMethodOverride =
    (opts.allowMethodOverride ?? false) && req.method === 'POST';

  type $Context = inferRouterContext<TRouter>;

  const infoTuple: ResultTuple<TRPCRequestInfo> = await run(async () => {
    try {
      return [
        undefined,
        await getRequestInfo({
          req,
          path: urlPathToProcedurePath(
            decodePath(opts.path),
            config.pathSeparator,
          ),
          router,
          searchParams: url.searchParams,
          headers: opts.req.headers,
          url,
          maxBatchSize: opts.maxBatchSize,
          pipelineLimits: pipelineLimitsOf(opts.experimental_allowPipelining),
        }),
      ];
    } catch (cause) {
      return [getTRPCErrorFromUnknown(cause), undefined];
    }
  });

  interface ContextManager {
    valueOrUndefined: () => $Context | undefined;
    value: () => $Context;
    create: (info: TRPCRequestInfo) => Promise<void>;
  }
  const ctxManager: ContextManager = run(() => {
    let result: ResultTuple<$Context> | undefined = undefined;
    return {
      valueOrUndefined: () => {
        if (!result) {
          return undefined;
        }
        return result[1];
      },
      value: () => {
        const [err, ctx] = result!;
        if (err) {
          throw err;
        }
        return ctx;
      },
      create: async (info) => {
        if (result) {
          throw new Error(
            'This should only be called once - report a bug in tRPC',
          );
        }
        try {
          const ctx = await opts.createContext({
            info,
          });
          result = [undefined, ctx];
        } catch (cause) {
          result = [getTRPCErrorFromUnknown(cause), undefined];
        }
      },
    };
  });

  const methodMapper = allowMethodOverride
    ? TYPE_ACCEPTED_METHOD_MAP_WITH_METHOD_OVERRIDE
    : TYPE_ACCEPTED_METHOD_MAP;

  /**
   * @deprecated
   */
  const isStreamCall = getAcceptHeader(req.headers) === 'application/jsonl';

  const experimentalSSE = config.sse?.enabled ?? true;
  try {
    const [infoError, info] = infoTuple;
    if (infoError) {
      throw infoError;
    }
    if (info.isBatchCall && !allowBatching) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Batching is not enabled on the server`,
      });
    }
    /* istanbul ignore if -- @preserve */
    if (isStreamCall && !info.isBatchCall) {
      throw new TRPCError({
        message: `Streaming requests must be batched (you can do a batch of 1)`,
        code: 'BAD_REQUEST',
      });
    }
    await ctxManager.create(info);

    // Only a pipelined batch has this, which the server only accepts with
    // `experimental_allowPipelining`
    const pipelined = info.experimental_pipeline;
    const pipeline = pipelined
      ? await run(async () => {
          if (info.type === 'mutation') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Only a batch of queries can be pipelined`,
            });
          }
          return pipelineCalls({
            calls: info.calls,
            pipe: await pipelined.getPipe(),
            transformer: config.transformer,
            inputOf: pipelined.getInput,
            limits: pipelined.limits,
            // Every run of a procedure counts towards `maxBatchSize`
            maxRuns:
              typeof opts.maxBatchSize === 'number' ? opts.maxBatchSize : null,
          });
        })
      : null;
    if (pipeline) {
      // After `createContext`, which can't wait for an input that a call fills in
      info.calls = pipeline.calls;
    }
    /**
     * In a pipelined batch, a call's or a run's error shape as the response
     * sends it: serialized once, and that is what is checked and sent. One
     * that JSON can't carry, such as one an `errorFormatter` gave a `BigInt`,
     * fails only that call or run, as an `INTERNAL_SERVER_ERROR`: in the
     * formatter's shape, or in the default one if JSON can't carry that
     * either. What the server refused before it ran is marked so, in each.
     */
    const pipelinedErrorShape = (sending: {
      error: TRPCError;
      input: unknown;
      call: TRPCRequestInfo['calls'][number] | undefined;
      /** Whether the server refused the call before any of its runs ran */
      notRun: boolean;
    }): SentShape => {
      const path = sending.call?.path;
      const shapeOf = (error: TRPCError, input: unknown): unknown => {
        const shape = getErrorShape({
          config,
          ctx: ctxManager.valueOrUndefined(),
          error,
          input,
          path,
          type: sending.call?.procedure?._def.type ?? 'unknown',
        });
        return sending.notRun ? markPipelineNotRun(shape) : shape;
      };
      const plainOf = (error: TRPCError): unknown => {
        const plain = getDefaultErrorShape({
          error,
          path,
          isDev: config.isDev,
        });
        return sending.notRun ? markPipelineNotRun(plain) : plain;
      };
      const transformer = config.transformer.output;
      /** What is sent, if it has the mark where it is to have it */
      const marked = (sent: SentShape | null) =>
        sent && (!sending.notRun || carriesNotRun(transformer, sent))
          ? sent
          : null;
      const sent = trySendableShape({
        transformer,
        shape: () => shapeOf(sending.error, sending.input),
        plain: plainOf(sending.error),
      });
      if (sent) {
        // A formatter's shape that is sent without the mark: the default
        // shape of the same error, which has it
        const withMark =
          marked(sent) ??
          marked(
            trySendableShape({
              transformer,
              shape: () => plainOf(sending.error),
              plain: plainOf(sending.error),
            }),
          );
        if (withMark) {
          return withMark;
        }
      }
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The error of this call cannot be sent',
      });
      const plain = plainOf(error);
      return (
        marked(
          trySendableShape({
            transformer,
            shape: () => shapeOf(error, undefined),
            plain,
          }),
        ) ?? {
          value: plain,
          // Strings and numbers only, which JSON can carry
          json: JSON.stringify(transformer.serialize(plain)),
          plain,
        }
      );
    };

    interface RPCResultOk {
      data: unknown;
      /**
       * For a call of a pipelined batch that runs for every item: its runs,
       * by item, in place of its data
       */
      items: PipelineItemsNode | null;
      /**
       * Only set for subscriptions
       */
      abort?: ReturnType<typeof combinedAbortController>;
    }
    type RPCResult = ResultTuple<RPCResultOk>;
    const bodyCancelled = new AbortController();
    const callSignal = abortSignalsAnyPonyfill([
      opts.req.signal,
      bodyCancelled.signal,
    ]);
    const runCall = async (
      call: TRPCRequestInfo['calls'][number],
      /** For a call of a pipelined batch that reads values: how it runs */
      piped: PipelineCallRun | null,
    ): Promise<RPCResult> => {
      const proc = call.procedure;
      const combinedAbort = combinedAbortController(callSignal);
      try {
        if (opts.error) {
          throw opts.error;
        }

        if (!proc) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No procedure found on path "${call.path}"`,
          });
        }

        if (!methodMapper[proc._def.type].includes(req.method as HTTPMethods)) {
          const accepted = opts.allowMethodOverride
            ? TYPE_ACCEPTED_METHOD_MAP_WITH_METHOD_OVERRIDE
            : TYPE_ACCEPTED_METHOD_MAP;
          // a 405 must list the methods the procedure accepts (RFC 9110 15.5.6)
          headers.set('allow', accepted[proc._def.type].join(', '));
          throw new TRPCError({
            code: 'METHOD_NOT_SUPPORTED',
            message: `Unsupported ${req.method}-request to ${proc._def.type} procedure at path "${call.path}"`,
          });
        }

        if (proc._def.type === 'subscription') {
          /* istanbul ignore if -- @preserve */
          if (info.isBatchCall) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot batch subscription calls`,
            });
          }
        }
        /**
         * For a call of a pipelined batch, which starts once what it reads is
         * ready: not if the client has gone by then
         */
        const throwIfAborted = () => {
          if (callSignal.aborted) {
            throw new TRPCError({
              code: 'CLIENT_CLOSED_REQUEST',
              message: 'The request was aborted',
            });
          }
        };
        const callProcedure = (getRawInput: () => Promise<unknown>) =>
          proc({
            path: call.path,
            getRawInput,
            ctx: ctxManager.value(),
            type: proc._def.type,
            signal: combinedAbort.signal,
            batchIndex: call.batchIndex,
          });
        // Once per item of its frame. Every run validates its input and has
        // its own result or error
        const items =
          piped?.kind === 'each'
            ? await piped.each({
                item: async (input) => {
                  throwIfAborted();
                  const itemData = await callProcedure(async () => input);
                  if (
                    isDataStream(itemData) ||
                    // Data with a `subscribe` that isn't a function is data
                    (isObservable(itemData) &&
                      typeof itemData.subscribe === 'function')
                  ) {
                    // It would be inside a list, where nothing streams it
                    throw new TRPCError({
                      code: 'UNSUPPORTED_MEDIA_TYPE',
                      message:
                        'A call for every item cannot return a stream-like response',
                    });
                  }
                  // What JSON can't carry fails the run, not the response or
                  // the stream. Serialized once: what was checked is sent
                  const sent = sendable(config.transformer.output, itemData);
                  return isStreamCall
                    ? streamedValue(config.transformer.output, sent)
                    : sent;
                },
                // What was checked and sent: data isn't serialized again
                read: (sent) => sent.json,
                error: (failure) => {
                  const error = getTRPCErrorFromUnknown(failure.cause);
                  opts.onError?.({
                    error,
                    path: call.path,
                    input: failure.input,
                    ctx: ctxManager.valueOrUndefined(),
                    type: proc._def.type,
                    req: opts.req,
                  });
                  return pipelinedErrorShape({
                    error,
                    input: failure.input,
                    call,
                    notRun: failure.notRun,
                  });
                },
              })
            : null;
        const data = items
          ? undefined
          : piped?.kind === 'once'
            ? // Its input is filled in first, so a procedure that never reads
              // it is refused, or doesn't run, as any other
              await run(async () => {
                const input = await piped.input();
                throwIfAborted();
                return callProcedure(async () => input);
              })
            : await callProcedure(call.getRawInput);
        return [
          undefined,
          {
            data,
            items,
            abort:
              proc._def.type === 'subscription' ? combinedAbort : undefined,
          },
        ];
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        const input = call.result();

        opts.onError?.({
          error,
          path: call.path,
          input,
          ctx: ctxManager.valueOrUndefined(),
          type: call.procedure?._def.type ?? 'unknown',
          req: opts.req,
        });

        return [error, undefined];
      }
    };
    const rpcCalls = pipeline
      ? pipeline.run({
          call: runCall,
          // What the calls that read a call's data get of it
          data: ([error, result]) => {
            if (error) {
              throw error;
            }
            if (!isStreamCall && isDataStream(result.data)) {
              // The response can't carry it, so the client gets an error for
              // this call. A call that reads it then doesn't run, as for any
              // failed call
              throw new TRPCError({
                code: 'UNSUPPORTED_MEDIA_TYPE',
                message: 'Cannot read the data of a stream-like response',
              });
            }
            return result.data;
          },
        })
      : info.calls.map((call) => runCall(call, null));

    // ----------- response handlers -----------
    if (!info.isBatchCall) {
      const [call] = info.calls;
      const [error, result] = await rpcCalls[0]!;

      switch (info.type) {
        case 'unknown':
        case 'mutation':
        case 'query': {
          // httpLink
          headers.set('content-type', 'application/json');

          if (isDataStream(result?.data)) {
            throw new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message:
                'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
            });
          }
          const res: TRPCResponse<unknown, inferRouterError<TRouter>> = error
            ? {
                error: getErrorShape({
                  config,
                  ctx: ctxManager.valueOrUndefined(),
                  error,
                  input: call!.result(),
                  path: call!.path,
                  type: info.type,
                }),
              }
            : { result: { data: result.data } };

          const headResponse = initResponse({
            ctx: ctxManager.valueOrUndefined(),
            info,
            responseMeta: opts.responseMeta,
            errors: error ? [error] : [],
            headers,
            untransformedJSON: [res],
          });
          return new Response(
            JSON.stringify(transformTRPCResponse(config, res)),
            {
              status: headResponse.status,
              headers,
            },
          );
        }
        case 'subscription': {
          // httpSubscriptionLink

          const iterable: AsyncIterable<unknown> = run(() => {
            if (error) {
              return errorToAsyncIterable(error);
            }
            if (!experimentalSSE) {
              return errorToAsyncIterable(
                new TRPCError({
                  code: 'METHOD_NOT_SUPPORTED',
                  message: 'Missing experimental flag "sseSubscriptions"',
                }),
              );
            }

            if (!isObservable(result.data) && !isAsyncIterable(result.data)) {
              return errorToAsyncIterable(
                new TRPCError({
                  message: `Subscription ${
                    call!.path
                  } did not return an observable or a AsyncGenerator`,
                  code: 'INTERNAL_SERVER_ERROR',
                }),
              );
            }
            const dataAsIterable = isObservable(result.data)
              ? observableToAsyncIterable(result.data, callSignal)
              : result.data;
            return dataAsIterable;
          });

          const stream = sseStreamProducer({
            ...config.sse,
            lastEventId: getLastEventId({
              headers: req.headers,
              searchParams: url.searchParams,
            }),
            data: iterable,
            serialize: (v) => config.transformer.output.serialize(v),
            formatError(errorOpts) {
              const error = getTRPCErrorFromUnknown(errorOpts.error);
              const input = call?.result();
              const path = call?.path;
              const type = call?.procedure?._def.type ?? 'unknown';

              opts.onError?.({
                error,
                path,
                input,
                ctx: ctxManager.valueOrUndefined(),
                req: opts.req,
                type,
              });

              const shape = getErrorShape({
                config,
                ctx: ctxManager.valueOrUndefined(),
                error,
                input,
                path,
                type,
              });

              return shape;
            },
          });
          for (const [key, value] of Object.entries(sseHeaders)) {
            headers.set(key, value);
          }

          const headResponse = initResponse({
            ctx: ctxManager.valueOrUndefined(),
            info,
            responseMeta: opts.responseMeta,
            errors: [],
            headers,
            untransformedJSON: null,
          });

          const abort = result?.abort;
          let responseBody: ReadableStream<Uint8Array> = stream;

          // Fixes: https://github.com/trpc/trpc/issues/7094
          if (abort) {
            const reader = stream.getReader();
            const maxDurationTimer = config.sse?.maxDurationMs
              ? setTimeout(
                  () => abort.controller.abort(),
                  config.sse.maxDurationMs,
                )
              : undefined;
            const onStreamEnd = () => {
              clearTimeout(maxDurationTimer);
              abort.signal.removeEventListener('abort', onAbort);
            };
            const onAbort = () => {
              onStreamEnd();
              void reader.cancel();
            };
            if (abort.signal.aborted) {
              onAbort();
            } else {
              abort.signal.addEventListener('abort', onAbort, { once: true });
            }

            responseBody = new ReadableStream({
              async pull(controller) {
                const chunk = await reader.read().catch((cause: unknown) => {
                  onStreamEnd();
                  throw cause;
                });
                if (chunk.done) {
                  onStreamEnd();
                  controller.close();
                } else {
                  controller.enqueue(chunk.value);
                }
              },
              cancel() {
                onStreamEnd();
                bodyCancelled.abort();
                return reader.cancel();
              },
            });
          }

          return new Response(responseBody, {
            headers,
            status: headResponse.status,
          });
        }
      }
    }

    // batch response handlers
    if (info.accept === 'application/jsonl') {
      // httpBatchStreamLink
      headers.set(
        'content-type',
        config.jsonl?.contentType ?? 'application/json',
      );
      headers.set('transfer-encoding', 'chunked');
      const headResponse = initResponse({
        ctx: ctxManager.valueOrUndefined(),
        info,
        responseMeta: opts.responseMeta,
        errors: [],
        headers,
        untransformedJSON: null,
      });
      const stream = jsonlStreamProducer({
        ...config.jsonl,
        /**
         * Example structure for `maxDepth: 4`:
         * {
         *   // 1
         *   0: {
         *     // 2
         *     result: {
         *       // 3
         *       data: // 4
         *     }
         *   }
         * }
         */
        maxDepth: Infinity,
        data: rpcCalls.map(async (res, index) => {
          const [error, result] = await res;

          const call = info.calls[index];

          if (error) {
            const shape = pipeline
              ? pipelinedErrorShape({
                  error,
                  input: call!.result(),
                  call,
                  notRun: pipeline.isNotRun(error),
                })
              : null;
            return {
              error: shape
                ? streamedShape(config.transformer.output, shape)
                : getErrorShape({
                    config,
                    ctx: ctxManager.valueOrUndefined(),
                    error,
                    input: call!.result(),
                    path: call!.path,
                    type: call!.procedure?._def.type ?? 'unknown',
                  }),
            };
          }
          if (result.items) {
            // A run's data as it was checked, read back
            return streamedItems(result.items, (outcome) =>
              'error' in outcome
                ? {
                    error: streamedShape(
                      config.transformer.output,
                      outcome.error,
                    ),
                  }
                : { result: { data: outcome.result.data.value } },
            );
          }

          /**
           * Not very pretty, but we need to wrap nested data in promises
           * Our stream producer will only resolve top-level async values or async values that are directly nested in another async value
           */
          const iterable = isObservable(result.data)
            ? observableToAsyncIterable(result.data, callSignal)
            : Promise.resolve(result.data);
          return {
            result: Promise.resolve({
              data: iterable,
            }),
          };
        }),
        serialize: (data) => config.transformer.output.serialize(data),
        onError: (cause) => {
          opts.onError?.({
            error: getTRPCErrorFromUnknown(cause.error),
            path: undefined,
            input: undefined,
            ctx: ctxManager.valueOrUndefined(),
            req: opts.req,
            type: info?.type ?? 'unknown',
          });
        },

        formatError(errorOpts) {
          const call = info?.calls[errorOpts.path[0] as any];

          const error = getTRPCErrorFromUnknown(errorOpts.error);
          const input = call?.result();
          const path = call?.path;
          const type = call?.procedure?._def.type ?? 'unknown';

          // no need to call `onError` here as it will be propagated through the stream itself

          const shape = getErrorShape({
            config,
            ctx: ctxManager.valueOrUndefined(),
            error,
            input,
            path,
            type,
          });

          return shape;
        },
      });

      return new Response(abortOnCancel(stream, bodyCancelled), {
        headers,
        status: headResponse.status,
      });
    }

    // httpBatchLink
    /**
     * Non-streaming response:
     * - await all responses in parallel, blocking on the slowest one
     * - create headers with known response body
     * - return a complete HTTPResponse
     */
    headers.set('content-type', 'application/json');
    const results: RPCResult[] = (await Promise.all(rpcCalls)).map(
      (res, index): RPCResult => {
        const [error, result] = res;
        if (error) {
          return res;
        }

        let streamLike: boolean;
        try {
          streamLike = isDataStream(result.data);
        } catch (cause) {
          if (!pipeline) {
            throw cause;
          }
          // A getter of the data that throws, in a pipelined batch: it fails
          // this call, as what JSON can't carry does, not the response
          const call = info.calls[index]!;
          const failure = getTRPCErrorFromUnknown(cause);
          opts.onError?.({
            error: failure,
            path: call.path,
            input: call.result(),
            ctx: ctxManager.valueOrUndefined(),
            type: call.procedure?._def.type ?? 'unknown',
            req: opts.req,
          });
          return [failure, undefined];
        }
        if (streamLike) {
          return [
            new TRPCError({
              code: 'UNSUPPORTED_MEDIA_TYPE',
              message:
                'Cannot use stream-like response in non-streaming request - use httpBatchStreamLink',
            }),
            undefined,
          ];
        }
        return res;
      },
    );
    /**
     * In a pipelined batch, each call's response as it is sent, serialized
     * once, and as `responseMeta` gets it. What JSON can't carry fails the
     * call, not the response
     */
    const pipelinedResponses = pipeline
      ? await Promise.all(
          results.map(async (res, index) => {
            const call = info.calls[index]!;
            const errorOf = (error: TRPCError) => {
              const shape = pipelinedErrorShape({
                error,
                input: call.result(),
                call,
                notRun: pipeline.isNotRun(error),
              });
              return {
                error,
                meta: { error: shape.value },
                sent: { error: sentOf(shape) },
              };
            };
            const [error, result] = res;
            if (error) {
              return errorOf(error);
            }
            if (result.items) {
              // A call for every item has no data of its own: each run's was
              // serialized as it ran, and is sent as it was checked.
              // `responseMeta` gets a result, with the runs as its data, and
              // the response has them in place of it
              return {
                error: undefined,
                meta: {
                  result: {
                    data: await settledItems(result.items, (outcome) =>
                      'error' in outcome
                        ? { error: outcome.error.value }
                        : { result: { data: outcome.result.data.value } },
                    ),
                  },
                },
                sent: await settledItems(result.items, (outcome) =>
                  'error' in outcome
                    ? { error: sentOf(outcome.error) }
                    : { result: { data: sentOf(outcome.result.data) } },
                ),
              };
            }
            let data: SentValue;
            try {
              data = sendable(config.transformer.output, result.data);
            } catch (cause) {
              const error = getTRPCErrorFromUnknown(cause);
              opts.onError?.({
                error,
                path: call.path,
                input: call.result(),
                ctx: ctxManager.valueOrUndefined(),
                type: call.procedure?._def.type ?? 'unknown',
                req: opts.req,
              });
              return errorOf(error);
            }
            return {
              error: undefined,
              meta: { result: { data: data.value } },
              sent: { result: { data: sentOf(data) } },
            };
          }),
        )
      : null;
    const resultAsRPCResponse = results.map(
      (
        [error, result],
        index,
      ): TRPCResponse<unknown, inferRouterError<TRouter>> => {
        const piped = pipelinedResponses?.[index];
        if (piped) {
          return piped.meta;
        }
        const call = info.calls[index]!;
        if (error) {
          return {
            error: getErrorShape({
              config,
              ctx: ctxManager.valueOrUndefined(),
              error,
              input: call.result(),
              path: call.path,
              type: call.procedure?._def.type ?? 'unknown',
            }),
          };
        }
        return {
          result: { data: result.data },
        };
      },
    );

    const errors = pipelinedResponses
      ? pipelinedResponses.map((it) => it.error)
      : results.map(([error]) => error);

    const headResponse = initResponse({
      ctx: ctxManager.valueOrUndefined(),
      info,
      responseMeta: opts.responseMeta,
      untransformedJSON: resultAsRPCResponse,
      errors,
      headers,
    });

    return new Response(
      JSON.stringify(
        resultAsRPCResponse.map(
          (response, index) =>
            pipelinedResponses?.[index]?.sent ??
            transformTRPCResponse(config, response),
        ),
      ),
      {
        status: headResponse.status,
        headers,
      },
    );
  } catch (cause) {
    const [_infoError, info] = infoTuple;
    const ctx = ctxManager.valueOrUndefined();
    // we get here if
    // - batching is called when it's not enabled
    // - `createContext()` throws
    // - `router._def._config.transformer.output.serialize()` throws
    // - post body is too large
    // - input deserialization fails
    // - `errorFormatter` return value is malformed
    const { error, untransformedJSON, body } = caughtErrorToData(cause, {
      opts,
      ctx: ctxManager.valueOrUndefined(),
      type: info?.type ?? 'unknown',
    });

    const headResponse = initResponse({
      ctx,
      info,
      responseMeta: opts.responseMeta,
      untransformedJSON,
      errors: [error],
      headers,
    });

    return new Response(body, {
      status: headResponse.status,
      headers,
    });
  }
}
