/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  DataTransformer,
  Dict,
  HTTPErrorResponseEnvelope,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
  Maybe,
  ProcedureType,
} from '@trpc/server';
import { getAbortController, getFetch } from './helpers';

type CancelFn = () => void;
type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

/* istanbul ignore next */
const retryDelay = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

export class TRPCClientError<TRouter extends AnyRouter> extends Error {
  public readonly json?: Maybe<HTTPErrorResponseEnvelope<TRouter>>;
  public readonly res?: Maybe<Response>;
  public readonly originalError?: Maybe<Error>;
  public readonly shape?: HTTPErrorResponseEnvelope<TRouter>['error'];

  constructor(
    message: string,
    {
      res,
      json,
      originalError,
    }: {
      res?: Maybe<Response>;
      json?: Maybe<HTTPErrorResponseEnvelope<TRouter>>;
      originalError?: Maybe<Error>;
    },
  ) {
    super(message);

    this.res = res;
    this.json = json;
    this.originalError = originalError;
    this.shape = this.json?.error;

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }
}

export interface FetchOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
}

export type LoggerOptions<TRouter extends AnyRouter> = {
  /**
   * Incremental id for requests
   */
  requestId: number;
  path: string;
  input: unknown;
  type: ProcedureType;
  headers: Dict<string>;
} & (
  | {
      event: 'init';
    }
  | {
      event: 'success';
      data?: unknown;
      elapsedMs: number;
    }
  | {
      event: 'error';
      error: TRPCClientError<TRouter>;
      elapsedMs: number;
    }
);

export interface CreateTRPCClientOptions<TRouter extends AnyRouter> {
  url: string;
  fetchOpts?: FetchOptions;
  getHeaders?: () => Dict<string>;
  onSuccess?: (data: HTTPSuccessResponseEnvelope<unknown>) => void;
  onError?: (error: TRPCClientError<TRouter>) => void;
  transformer?: DataTransformer;
  /**
   * Request logger, default behaviour is that it logs requests in development, but not production.
   * Override with custom logger / set to `null` to disable
   */
  logger?: null | ((opts: LoggerOptions<TRouter>) => void);
}

let requestCounter = 0;

export class TRPCClient<TRouter extends AnyRouter> {
  private fetch: typeof fetch;
  private AC: ReturnType<typeof getAbortController>;
  public readonly transformer: DataTransformer;
  private opts: CreateTRPCClientOptions<TRouter>;
  private logger: Maybe<CreateTRPCClientOptions<TRouter>['logger']>;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    const { fetchOpts } = opts;
    this.opts = opts;
    const _fetch = getFetch(fetchOpts?.fetch);
    this.fetch = (...args: any[]) => (_fetch as any)(...args);
    this.AC = getAbortController(fetchOpts?.AbortController);
    this.transformer = opts.transformer ?? {
      serialize: (data) => data,
      deserialize: (data) => data,
    };
    if ('logger' in opts) {
      this.logger = opts.logger;
    } else if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test'
    ) {
      this.logger = TRPCClient.defaultLogger;
    }
  }

  private static defaultLogger(opts: LoggerOptions<any>) {
    const { event, type, path, requestId, input, headers } = opts;
    const palette = {
      query: ['72e3ff', '3fb0d8'],
      mutation: ['c5a3fc', '904dfc'],
      subscription: ['ff49e1', 'd83fbe'],
    };
    const [light, dark] = palette[type];

    const css = `
      background-color: #${event === 'init' ? light : dark}; 
      color: ${event === 'init' ? 'black' : 'white'};
      padding: 2px;
    `;
    const emojiMap = {
      init: '⏳',
      success: '✅',
      error: '❌',
    };

    const parts = [
      '%c',
      emojiMap[event],
      event === 'init' ? '>>' : '<<',
      type,
      `#${requestId}`,
      `%c${path}%c`,
      '%O',
    ];
    const args: any[] = [
      css,
      `${css}; font-weight: bold;`,
      `${css}; font-weight: normal;`,
    ];
    if (opts.event === 'error') {
      args.push({
        input,
        error: opts.error,
        headers,
        elapsedMs: opts.elapsedMs,
      });
    } else if (opts.event === 'success') {
      args.push({
        input,
        output: opts.data,
        headers,
        elapsedMs: opts.elapsedMs,
      });
    } else if (opts.event === 'init') {
      args.push({ input, headers });
    }

    console.log(parts.join(' '), ...args);
  }
  private serializeInput(input: unknown) {
    return typeof input !== 'undefined'
      ? this.transformer.serialize(input)
      : input;
  }
  private async executeRequest(url: string, opts: RequestInit) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown, TRouter>> = null;
    try {
      res = await this.fetch(url, opts);
      const rawJson = await res.json();
      json = this.transformer.deserialize(rawJson) as HTTPResponseEnvelope<
        unknown,
        TRouter
      >;

      if (json.ok) {
        return {
          ok: true as const,
          data: json.data,
          json,
          res,
        };
      }
      return {
        ok: false as const,
        error: new TRPCClientError(json.error.message, { json, res }),
      };
    } catch (originalError) {
      let error: TRPCClientError<TRouter> = originalError;
      if (!(error instanceof TRPCClientError)) {
        error = new TRPCClientError(originalError.message, {
          originalError,
          json: json?.ok ? null : json,
          res,
        });
      }
      return {
        ok: false as const,
        error,
      };
    }
  }
  private getHeaders() {
    return {
      'content-type': 'application/json',
      ...(this.opts.getHeaders ? this.opts.getHeaders() : {}),
    };
  }

  private initRequest({
    type,
    input,
    path,
  }: {
    type: ProcedureType;
    input: unknown;
    path: string;
  }) {
    type ReqOpts = {
      method: string;
      body?: string;
      url: string;
    };
    const requestId = ++requestCounter;
    const requestStartTime = Date.now();
    const { url } = this.opts;
    const reqOptsMap: Record<ProcedureType, () => ReqOpts> = {
      query: () => ({
        method: 'GET',
        url:
          `${url}/${path}` +
          (input != null
            ? `?input=${encodeURIComponent(
                JSON.stringify(this.serializeInput(input)),
              )}`
            : ''),
      }),
      mutation: () => ({
        method: 'POST',
        body: JSON.stringify({ input: this.serializeInput(input) }),
        url: `${url}/${path}`,
      }),
      subscription: () => ({
        method: 'PATCH',
        body: JSON.stringify({ input: this.serializeInput(input) }),
        url: `${url}/${path}`,
      }),
    };

    const reqOptsFn = reqOptsMap[type];
    /* istanbul ignore next */
    if (!reqOptsFn) {
      throw new Error(`Unhandled type "${type}"`);
    }
    const ac = this.AC ? new this.AC() : null;

    const { url: reqUrl, ...rest } = reqOptsFn();
    const headers = this.getHeaders();
    const reqOpts = {
      ...rest,
      signal: ac?.signal,
      headers,
    };
    const responsePromise = new Promise((resolve, reject) => {
      this.logger &&
        this.logger({
          event: 'init',
          path,
          input,
          requestId,
          type,
          headers,
        });
      this.executeRequest(reqUrl, reqOpts).then((res) => {
        const elapsedMs = Date.now() - requestStartTime;
        if (res.ok) {
          this.opts.onSuccess && this.opts.onSuccess(res.json);
          this.logger &&
            this.logger({
              event: 'success',
              path,
              input,
              requestId,
              type,
              headers,
              elapsedMs,
              data: res.data,
            });
          resolve(res.json.data);
        } else {
          this.opts.onError && this.opts.onError(res.error);

          this.logger &&
            this.logger({
              event: 'error',
              path,
              input,
              requestId,
              type,
              headers,
              elapsedMs,
              error: res.error,
            });
          reject(res.error);
        }
      });
    }) as CancellablePromise<any>;
    responsePromise.cancel = () => {
      return ac?.abort();
    };

    return responsePromise;
  }

  /**
   * @deprecated use `query()`/`mutation()` instead
   */
  public request(opts: { type: ProcedureType; input: unknown; path: string }) {
    return this.initRequest(opts);
  }

  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries
  >(
    path: TPath,
    ...args: inferHandlerInput<TQueries[TPath]>
  ): CancellablePromise<inferProcedureOutput<TQueries[TPath]>> {
    return this.initRequest({
      type: 'query',
      path,
      input: args[0],
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations
  >(
    path: TPath,
    ...args: inferHandlerInput<TMutations[TPath]>
  ): CancellablePromise<inferProcedureOutput<TMutations[TPath]>> {
    return this.initRequest({
      type: 'mutation',
      path,
      input: args[0],
    });
  }
  /* istanbul ignore next */
  public subscriptionOnce<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>
  >(path: TPath, input: TInput): CancellablePromise<TOutput[]> {
    let stopped = false;
    let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentRequest: CancellablePromise<TOutput[]> | null = null;

    const promise = new Promise<TOutput[]>((resolve, reject) => {
      const exec = async () => {
        if (stopped) {
          return;
        }
        try {
          currentRequest = this.initRequest({
            type: 'subscription',
            input,
            path,
          });
          const data = await currentRequest;

          resolve(data);
        } catch (_err) {
          const err: TRPCClientError<TRouter> = _err;

          if (err.json?.statusCode === 408) {
            // server told us to reconnect
            exec();
          } else {
            reject(err);
          }
        }
      };
      exec();
    }) as CancellablePromise<TOutput[]>;
    promise.cancel = () => {
      stopped = true;
      clearTimeout(nextTry);
      currentRequest?.cancel && currentRequest.cancel();
    };

    return (promise as any) as CancellablePromise<TOutput[]>;
  }
  /* istanbul ignore next */
  public subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>
  >(
    path: TPath,
    opts: {
      initialInput: TInput;
      onError?: (err: TRPCClientError<TRouter>) => void;
      onData?: (data: TOutput[]) => void;
      /**
       * Input cursor for next call to subscription endpoint
       */
      nextInput: (data: TOutput[]) => TInput;
    },
  ): CancelFn {
    let stopped = false;
    // let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentPromise: CancellablePromise<TOutput[]> | null = null;

    let attemptIndex = 0;
    const unsubscribe: CancelFn = () => {
      stopped = true;
      currentPromise?.cancel();
      currentPromise = null;
    };
    const exec = async (input: TInput) => {
      try {
        currentPromise = this.subscriptionOnce(path, input);
        const res = await currentPromise;
        attemptIndex = 0;
        opts.onData && opts.onData(res);

        const nextInput = opts.nextInput(res);
        exec(nextInput);
      } catch (err) {
        if (stopped) {
          return;
        }
        opts.onError && opts.onError(err);
        attemptIndex++;
        setTimeout(() => {
          exec(input);
        }, retryDelay(attemptIndex));
      }
    };
    exec(opts.initialInput);
    return unsubscribe;
  }
}

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return new TRPCClient<TRouter>(opts);
}
