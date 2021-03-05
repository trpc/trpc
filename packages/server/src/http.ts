/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import qs from 'qs';
import url from 'url';
import { assertNotBrowser } from './assertNotBrowser';
import {
  HTTPError,
  httpError,
  TRPCResponseError,
  HTTPSuccessResponseEnvelope,
  getErrorResponseEnvelope,
  getErrorFromUnknown,
} from './errors';
import { AnyRouter, ProcedureType } from './router';
import { Subscription } from './subscription';
import { DataTransformer } from './transformer';
assertNotBrowser();

export function getQueryInput(query: qs.ParsedQs) {
  const queryInput = query.input;
  if (!queryInput) {
    return undefined;
  }
  try {
    return JSON.parse(queryInput as string);
  } catch (err) {
    throw new HTTPError(400, 'Expected query.input to be a JSON string');
  }
}

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TContext, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => TContext | Promise<TContext>;

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

export interface BaseOptions {
  subscriptions?: {
    /**
     * Time in milliseconds before `408` is sent
     */
    requestTimeoutMs?: number;
    /**
     * Allow for some backpressure and batch send events every X ms
     */
    backpressureMs?: number;
  };
  teardown?: () => Promise<void>;
  /**
   * Optional transformer too serialize/deserialize input args + data
   */
  transformer?: DataTransformer;
  maxBodySize?: number;
  onError?: (err: TRPCResponseError) => void;
}

async function getPostBody({
  req,
  maxBodySize,
}: {
  req: BaseRequest;
  maxBodySize?: number;
}) {
  return new Promise<any>((resolve, reject) => {
    if (req.body) {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', function (data) {
      body += data;
      if (typeof maxBodySize === 'number' && body.length > maxBodySize) {
        reject(new HTTPError(413, 'Payload Too Large'));
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        reject(httpError.badRequest("Body couldn't be parsed as json"));
      }
    });
  });
}

const HTTP_METHOD_PROCEDURE_TYPE_MAP: Record<
  string,
  ProcedureType | undefined
> = {
  GET: 'query',
  POST: 'mutation',
  PATCH: 'subscription',
};

export async function requestHandler<
  TContext,
  TRouter extends AnyRouter<TContext>,
  TCreateContextFn extends CreateContextFn<TContext, TRequest, TResponse>,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse
>({
  req,
  res,
  router,
  path,
  subscriptions,
  createContext,
  teardown,
  transformer = {
    serialize: (data) => data,
    deserialize: (data) => data,
  },
  maxBodySize,
  onError,
}: {
  req: TRequest;
  res: TResponse;
  path: string;
  router: TRouter;
  createContext: TCreateContextFn;
} & BaseOptions) {
  let procedureType: 'unknown' | ProcedureType = 'unknown';
  let input: unknown = undefined;
  try {
    let output: unknown;

    const ctx = createContext && (await createContext({ req, res }));
    const method = req.method;

    const deserializeInput = (input: unknown) =>
      input ? transformer.deserialize(input) : input;

    const caller = router.createCaller(ctx);
    procedureType = HTTP_METHOD_PROCEDURE_TYPE_MAP[req.method!] ?? 'unknown';
    const getInput = async () => {
      if (procedureType === 'query') {
        const query = req.query ? req.query : url.parse(req.url!, true).query;
        const input = getQueryInput(query);
        return deserializeInput(input);
      }
      if (procedureType === 'mutation' || procedureType === 'subscription') {
        const body = await getPostBody({ req, maxBodySize });
        const input = deserializeInput(body.input);
        return input;
      }
      return undefined;
    };
    input = await getInput();

    if (method === 'HEAD') {
      res.statusCode = 204;
      res.end();
      return;
    } else if (procedureType === 'query') {
      output = await caller.query(path, input);
    } else if (procedureType === 'mutation') {
      output = await caller.mutation(path, input);
    } else if (procedureType === 'subscription') {
      const sub = (output = await caller.subscription(
        path,
        input,
      )) as Subscription;

      output = await new Promise((resolve, reject) => {
        const startTime = Date.now();

        const buffer: unknown[] = [];

        const requestTimeoutMs = subscriptions?.requestTimeoutMs ?? 9000; // 10s is vercel's api timeout
        const backpressureMs = subscriptions?.backpressureMs ?? 0;

        // timers
        let backpressureTimer: any = null;
        let requestTimeoutTimer: any = null;

        function cleanup() {
          sub.off('data', onData);
          sub.off('error', onError);
          sub.off('destroy', onDestroy);
          req.off('close', onClose);
          res.off('close', onClose);
          clearTimeout(requestTimeoutTimer);
          clearTimeout(backpressureTimer);
          sub.destroy();
        }
        function onData(data: unknown) {
          buffer.push(data);

          const requestTimeLeft = requestTimeoutMs - (Date.now() - startTime);

          const success = () => {
            cleanup();
            resolve(buffer);
          };
          if (requestTimeLeft <= backpressureMs) {
            // will timeout before next backpressure tick
            success();
            return;
          }
          if (!backpressureTimer) {
            backpressureTimer = setTimeout(success, backpressureMs);
            return;
          }
        }
        function onError(err: Error) {
          cleanup();
          // maybe if `buffer` has length here we should just return instead?
          reject(err);
        }
        function onClose() {
          cleanup();
          reject(new HTTPError(499, `Client Closed Request`));
        }
        function onRequestTimeout() {
          cleanup();
          reject(
            new HTTPError(
              408,
              `Subscription exceeded ${requestTimeoutMs}ms - please reconnect.`,
            ),
          );
        }

        function onDestroy() {
          reject(new HTTPError(500, `Subscription was destroyed prematurely`));
          cleanup();
        }

        sub.on('data', onData);
        sub.on('error', onError);
        sub.on('destroy', onDestroy);
        req.once('close', onClose);
        res.once('close', onClose);
        requestTimeoutTimer = setTimeout(onRequestTimeout, requestTimeoutMs);
        sub.start();
      });
    } else {
      throw new HTTPError(405, `Unexpected request method ${method}`);
    }
    const json: HTTPSuccessResponseEnvelope<unknown> = {
      ok: true,
      statusCode: res.statusCode ?? 200,
      data: output,
    };
    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
  } catch (_err) {
    const err = getErrorFromUnknown(_err, path, procedureType);

    const json = getErrorResponseEnvelope(err);

    res.statusCode = json.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(transformer.serialize(json)));
    onError && onError(err);
  }
  try {
    teardown && (await teardown());
  } catch (err) {
    console.error('Teardown failed', err);
  }
}
