import { getAbortController, getFetch } from './helpers';

type Operation = {
  type: 'query' | 'mutation' | 'subscription';
  input: unknown;
  path: string;
};
type ResultEnvelope =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: Error;
    };

type ContextLink = (opts: {
  op: Operation;
  prev: (result: ResultEnvelope) => void;
  next: (op: Operation, callback: (result: ResultEnvelope) => void) => void;
  onDone: (callback: () => void) => void;
}) => void;

type AppLink = () => ContextLink;

export function retryLink(opts: { attempts: number }): AppLink {
  // initialized config
  return () => {
    // initialized in app
    return ({ op: ctx, next, prev }) => {
      // initialized for request
      let attempts = 0;
      const fn = () => {
        attempts++;
        next(ctx, (result) => {
          if (result.ok) {
            prev(result);
          } else {
            attempts < opts.attempts ? fn() : prev(result);
          }
        });
      };
      fn();
    };
  };
}

export interface HttpLinkOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
  url: string;
}
type CallType = 'subscription' | 'query' | 'mutation';

type ReqOpts = {
  method: string;
  body?: string;
  url: string;
};
export function httpLink(opts: HttpLinkOptions): AppLink {
  const _fetch = getFetch(opts?.fetch);
  const AC = getAbortController(opts?.AbortController);
  const { url } = opts;
  // initialized config
  return () => {
    // initialized in app
    return ({ op, prev, onDone }) => {
      const ac = AC ? new AC() : null;
      const { path, input, type } = op;
      const reqOptsMap: Record<CallType, () => ReqOpts> = {
        subscription: () => ({
          method: 'PATCH',
          body: JSON.stringify({ input }),
          url: `${url}/${path}`,
        }),
        mutation: () => ({
          method: 'POST',
          body: JSON.stringify({ input }),
          url: `${url}/${path}`,
        }),
        query: () => ({
          method: 'GET',
          url:
            `${url}/${path}` +
            (input != null
              ? `?input=${encodeURIComponent(JSON.stringify(input))}`
              : ''),
        }),
      };

      async function fetchAndReturn() {
        const opts = reqOptsMap[type]();
        try {
          const res = await _fetch(url, { ...opts, signal: ac?.signal });
          const json = await res.json();
          prev(json);
        } catch (error) {
          prev({
            ok: false,
            error,
          });
        }
      }
      fetchAndReturn();
      onDone(() => {
        ac?.abort();
      });
    };
  };
}
