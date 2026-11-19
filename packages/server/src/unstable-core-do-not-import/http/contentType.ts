import { TRPCError } from '../error/TRPCError';
import type { ProcedureType } from '../procedure';
import { getProcedureAtPath, type AnyRouter } from '../router';
import { emptyObject, isObject } from '../utils';
import { parseConnectionParamsFromString } from './parseConnectionParams';
import {
  pipelineDecodedInput,
  pipelineSentInput,
  pipeOfBody,
  pipeOfSearchParams,
} from './pipeline/server';
import type { PipelineSentInput } from './pipeline/server';
import { pipelineBatch } from './pipeline/wire';
import type { PipelineLimits } from './pipeline/wire';
import type { TRPCAcceptHeader, TRPCRequestInfo } from './types';

export function getAcceptHeader(headers: Headers): TRPCAcceptHeader | null {
  return (
    (headers.get('trpc-accept') as TRPCAcceptHeader | null) ??
    (headers
      .get('accept')
      ?.split(',')
      .some((t) => t.trim() === 'application/jsonl')
      ? 'application/jsonl'
      : null)
  );
}

export function getLastEventId(opts: {
  headers: Headers;
  searchParams: URLSearchParams;
}): string | null {
  return (
    opts.headers.get('last-event-id') ??
    opts.searchParams.get('lastEventId') ??
    opts.searchParams.get('Last-Event-Id')
  );
}

type GetRequestInfoOptions = {
  path: string;
  req: Request;
  url: URL | null;
  searchParams: URLSearchParams;
  headers: Headers;
  router: AnyRouter;
  maxBatchSize?: number;
  /**
   * What a pipelined batch, `?batch=pipeline`, can make the server do, or
   * `null` if it isn't accepted: it is then a bad request
   */
  pipelineLimits: PipelineLimits | null;
};

type ContentTypeHandler = {
  isMatch: (opts: Request) => boolean;
  parse: (opts: GetRequestInfoOptions) => Promise<TRPCRequestInfo>;
};

/**
 * Memoize a function that takes no arguments
 * @internal
 */
function memo<TReturn>(fn: () => Promise<TReturn>) {
  let promise: Promise<TReturn> | null = null;
  const sym = Symbol.for('@trpc/server/http/memo');
  let value: TReturn | typeof sym = sym;
  return {
    /**
     * Lazily read the value
     */
    read: async (): Promise<TReturn> => {
      if (value !== sym) {
        return value;
      }

      // dedupes promises and catches errors
      promise ??= fn().catch((cause) => {
        if (cause instanceof TRPCError) {
          throw cause;
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: cause instanceof Error ? cause.message : 'Invalid input',
          cause,
        });
      });

      value = await promise;
      promise = null;

      return value;
    },
    /**
     * Get an already stored result
     */
    result: (): TReturn | undefined => {
      return value !== sym ? value : undefined;
    },
  };
}

/**
 * Media types are case-insensitive
 * @see https://www.rfc-editor.org/rfc/rfc9110#section-8.3.1
 */
function hasContentType(req: Request, type: string) {
  const contentType = req.headers.get('content-type')?.toLowerCase();
  return contentType?.split(';', 1)[0]?.trim() === type;
}

const jsonContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return hasContentType(req, 'application/json');
  },
  async parse(opts) {
    const { req } = opts;
    const batch = opts.searchParams.get('batch');
    // A batch whose calls read their inputs from each other's data
    const isPipelined = batch === pipelineBatch;
    const { pipelineLimits } = opts;
    if (isPipelined && !pipelineLimits) {
      // Before anything of it runs: its calls have holes in their inputs
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Pipelining is not enabled on the server. Set `experimental_allowPipelining: true` on its handler, or remove `experimental_pipelining` from the link',
      });
    }
    const isBatchCall = batch === '1' || isPipelined;
    const maxBatchSize = opts.maxBatchSize;

    const paths = isBatchCall ? opts.path.split(',') : [opts.path];
    if (
      isBatchCall &&
      typeof maxBatchSize === 'number' &&
      paths.length > maxBatchSize
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Batch call exceeds maximum size`,
      });
    }
    // Each call is a run, so a pipelined batch with more of them than
    // `maxRuns` would go over it before anything is filled in
    if (
      pipelineLimits &&
      isPipelined &&
      paths.length > pipelineLimits.maxRuns
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The batch has ${paths.length} calls, more than \`maxRuns\` (${pipelineLimits.maxRuns}) allows`,
      });
    }

    type InputRecord = Record<number, unknown>;
    /**
     * The inputs as JSON, before the transformer reads them. For a pipelined
     * batch, the `pipe` that its body has beside them, and each call's input
     * as the client sent it, taken here: the transformer can decode an input
     * in place once it reads it
     */
    const getJSON = memo(
      async (): Promise<{
        inputs: unknown;
        bodyPipe: unknown;
        sent: PipelineSentInput[];
      }> => {
        const read = (inputs: unknown, bodyPipe: unknown) => ({
          inputs,
          bodyPipe,
          sent: isPipelined
            ? paths.map((_path, index) =>
                pipelineSentInput(isObject(inputs) ? inputs[index] : undefined),
              )
            : [],
        });
        if (req.method === 'GET') {
          const queryInput = opts.searchParams.get('input');
          return read(
            queryInput ? JSON.parse(queryInput) : undefined,
            undefined,
          );
        }
        // `httpLink` sends no body when the input is `undefined`, so treat an
        // empty body like a GET without `?input=`
        const body = await req.text();
        const inputs: unknown = body ? JSON.parse(body) : undefined;
        return read(inputs, isPipelined ? pipeOfBody(inputs) : undefined);
      },
    );
    const getInputs = memo(async (): Promise<InputRecord> => {
      const { inputs } = await getJSON.read();
      if (inputs === undefined) {
        return emptyObject();
      }

      if (!isBatchCall) {
        const result: InputRecord = emptyObject();
        result[0] =
          opts.router._def._config.transformer.input.deserialize(inputs);
        return result;
      }

      if (!isObject(inputs)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }
      const acc: InputRecord = emptyObject();
      for (const index of paths.keys()) {
        const input = inputs[index];
        if (input !== undefined) {
          acc[index] =
            opts.router._def._config.transformer.input.deserialize(input);
        }
      }

      return acc;
    });

    const calls = await Promise.all(
      paths.map(
        async (path, index): Promise<TRPCRequestInfo['calls'][number]> => {
          const procedure = await getProcedureAtPath(opts.router, path);
          return {
            batchIndex: index,
            path,
            procedure,
            getRawInput: async () => {
              const inputs = await getInputs.read();
              let input = inputs[index];

              if (procedure?._def.type === 'subscription') {
                const lastEventId = getLastEventId(opts);

                if (lastEventId) {
                  if (isObject(input)) {
                    input = {
                      ...input,
                      lastEventId: lastEventId,
                    };
                  } else {
                    input ??= {
                      lastEventId: lastEventId,
                    };
                  }
                }
              }
              return input;
            },
            result: () => {
              return getInputs.result()?.[index];
            },
          };
        },
      ),
    );

    const types = new Set(
      calls.map((call) => call.procedure?._def.type).filter(Boolean),
    );

    /* istanbul ignore if -- @preserve */
    if (types.size > 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot mix procedure types in call: ${Array.from(types).join(
          ', ',
        )}`,
      });
    }
    const type: ProcedureType | 'unknown' =
      types.values().next().value ?? 'unknown';

    const connectionParamsStr = opts.searchParams.get('connectionParams');

    const info: TRPCRequestInfo = {
      isBatchCall,
      accept: getAcceptHeader(req.headers),
      calls,
      type,
      connectionParams:
        connectionParamsStr === null
          ? null
          : parseConnectionParamsFromString(connectionParamsStr),
      signal: req.signal,
      url: opts.url,
      ...(isPipelined &&
        pipelineLimits && {
          experimental_pipeline: {
            limits: pipelineLimits,
            getPipe: async () => {
              // A GET has it in the URL. Any other request has it in its body,
              // beside the inputs
              // Without the transformer: an input it can't read fails its own
              // call, not the batch
              if (req.method === 'GET') {
                return pipeOfSearchParams(opts.searchParams);
              }
              return (await getJSON.read()).bodyPipe;
            },
            getInput: async (index) => {
              const { sent } = await getJSON.read();
              const decoded = (await getInputs.read())[index];
              return {
                // One for every call, as the request was read
                sent: sent[index] ?? pipelineSentInput(undefined),
                decoded: pipelineDecodedInput(decoded),
              };
            },
          },
        }),
    };
    return info;
  },
};

const formDataContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return hasContentType(req, 'multipart/form-data');
  },
  async parse(opts) {
    const { req } = opts;
    if (req.method !== 'POST') {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message:
          'Only POST requests are supported for multipart/form-data requests',
      });
    }
    const getInputs = memo(async () => {
      const fd = await req.formData();
      return fd;
    });
    const procedure = await getProcedureAtPath(opts.router, opts.path);
    return {
      accept: null,
      calls: [
        {
          batchIndex: 0,
          path: opts.path,
          getRawInput: getInputs.read,
          result: getInputs.result,
          procedure,
        },
      ],
      isBatchCall: false,
      type: 'mutation',
      connectionParams: null,
      signal: req.signal,
      url: opts.url,
    };
  },
};

const octetStreamContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return hasContentType(req, 'application/octet-stream');
  },
  async parse(opts) {
    const { req } = opts;
    if (req.method !== 'POST') {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message:
          'Only POST requests are supported for application/octet-stream requests',
      });
    }
    const getInputs = memo(async () => {
      return req.body;
    });
    return {
      calls: [
        {
          batchIndex: 0,
          path: opts.path,
          getRawInput: getInputs.read,
          result: getInputs.result,
          procedure: await getProcedureAtPath(opts.router, opts.path),
        },
      ],
      isBatchCall: false,
      accept: null,
      type: 'mutation',
      connectionParams: null,
      signal: req.signal,
      url: opts.url,
    };
  },
};

const handlers = [
  jsonContentTypeHandler,
  formDataContentTypeHandler,
  octetStreamContentTypeHandler,
];

function getContentTypeHandler(req: Request): ContentTypeHandler {
  const handler = handlers.find((handler) => handler.isMatch(req));
  if (handler) {
    return handler;
  }

  if (!handler && req.method === 'GET') {
    // fallback to JSON for get requests so GET-requests can be opened in browser easily
    return jsonContentTypeHandler;
  }

  throw new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: req.headers.has('content-type')
      ? `Unsupported content-type "${req.headers.get('content-type')}`
      : 'Missing content-type header',
  });
}

export async function getRequestInfo(
  opts: GetRequestInfoOptions,
): Promise<TRPCRequestInfo> {
  const handler = getContentTypeHandler(opts.req);
  return await handler.parse(opts);
}
