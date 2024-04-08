/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// @trpc/server
import { Stream } from 'stream';
import type { AnyRouter } from '../../@trpc/server';
import type {
  HTTPRequest,
  HTTPResponse,
  ResolveHTTPRequestOptionsContextFn,
  ResponseChunk,
} from '../../@trpc/server/http';
import {
  getBatchStreamFormatter,
  resolveHTTPResponse,
} from '../../@trpc/server/http';
import { experimental_parseMultipartFormData } from './content-type/form-data';
import { createMemoryUploadHandler } from './content-type/form-data/uploadHandler';
import { nodeHTTPJSONContentTypeHandler } from './content-type/json';
import type { NodeHTTPContentTypeHandler } from './internals/contentType';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

const defaultJSONContentTypeHandler = nodeHTTPJSONContentTypeHandler();
const defaultFormDataContentTypeHandler: NodeHTTPContentTypeHandler<
  NodeHTTPRequest,
  NodeHTTPResponse
> = {
  isMatch(opts) {
    return (
      opts.req.headers['content-type']?.startsWith('multipart/form-data') ??
      false
    );
  },
  async getInputs(opts, inputOpts) {
    console.log('defaultFormDataContentTypeHandler getInputs');

    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for form-data');
    }

    const form = await experimental_parseMultipartFormData(
      opts.req,
      createMemoryUploadHandler(),
    );

    return form;
  },
};
const defaultOctetContentTypeHandler: NodeHTTPContentTypeHandler<
  NodeHTTPRequest,
  NodeHTTPResponse
> = {
  isMatch(opts) {
    return (
      opts.req.headers['content-type']?.startsWith(
        'application/octet-stream',
      ) ?? false
    );
  },
  async getInputs(opts, inputOpts) {
    console.log('defaultOctetContentTypeHandler getInputs');

    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for octet-stream');
    }

    const stream = Stream.Readable.from(opts.req);

    return stream;
  },
};

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    if (err) throw err;

    //
    // Build tRPC dependencies

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({
        ...opts,
        ...innerOpts,
      });
    };

    const query = opts.req.query
      ? new URLSearchParams(opts.req.query as any)
      : new URLSearchParams(opts.req.url!.split('?')[1]);

    const contentTypeHandlers = [
      defaultFormDataContentTypeHandler,
      defaultOctetContentTypeHandler,
    ];

    const contentTypeHandler =
      contentTypeHandlers.find((handler) =>
        handler.isMatch({
          // FIXME: no typecasting should be needed here
          ...(opts as any),
          query,
        }),
      ) ??
      // fallback to json
      defaultJSONContentTypeHandler;

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
    };

    let isStream = false;
    let formatter: ReturnType<typeof getBatchStreamFormatter>;
    const unstable_onHead = (head: HTTPResponse, isStreaming: boolean) => {
      if (
        'status' in head &&
        (!opts.res.statusCode || opts.res.statusCode === 200)
      ) {
        opts.res.statusCode = head.status;
      }
      for (const [key, value] of Object.entries(head.headers ?? {})) {
        /* istanbul ignore if -- @preserve */
        if (typeof value === 'undefined') {
          continue;
        }
        opts.res.setHeader(key, value);
      }
      if (isStreaming) {
        opts.res.setHeader('Transfer-Encoding', 'chunked');
        const vary = opts.res.getHeader('Vary');
        opts.res.setHeader(
          'Vary',
          vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode',
        );
        isStream = true;
        formatter = getBatchStreamFormatter();
        opts.res.flushHeaders();
      }
    };

    const unstable_onChunk = ([index, string]: ResponseChunk) => {
      if (index === -1) {
        /**
         * Full response, no streaming. This can happen
         * - if the response is an error
         * - if response is empty (HEAD request)
         */
        opts.res.end(string);
      } else {
        opts.res.write(formatter!(index, string));
        opts.res.flush?.();
      }
    };

    console.debug(
      'resolving http response for',
      opts.req.headers['content-type'],
      opts.req.url,
    );
    await resolveHTTPResponse<TRouter, HTTPRequest>({
      ...opts,
      req,
      createContext,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
      async getInput(inputsOpts) {
        // TODO: "opts as any" shouldn't be needed but this seems to be a common problem elsewhere in the repo
        // Basically some types could be subtypes and so it appears incompatible but it actually is, probably?
        return await contentTypeHandler.getInputs(opts as any, inputsOpts);
      },
      unstable_onHead,
      unstable_onChunk,
    });

    if (isStream) {
      opts.res.write(formatter!.end());
      opts.res.end();
    }

    return opts.res;
  });
}
