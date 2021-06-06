import { getAbortController, getFetch } from './helpers';
import { observable } from './observable';

type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
type ResultEnvelope<TOutput = unknown> =
  | {
      ok: true;
      data: TOutput;
    }
  | {
      ok: false;
      error: Error;
    };

type PrevCallback = (result: ResultEnvelope) => void;
type ContextLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

type AppLink = () => ContextLink;

export function retryLink(opts: { attempts: number }): AppLink {
  // initialized config
  return () => {
    // initialized in app
    return ({ op, next, prev }) => {
      // initialized for request
      let attempts = 0;
      const fn = () => {
        attempts++;
        next(op, (result) => {
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
    return ({ op, prev, onDestroy: onDone }) => {
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
          const res = await _fetch(opts.url, { ...opts, signal: ac?.signal });
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

export function chainer(links: ContextLink[]) {
  return {
    call(_op: Operation) {
      const obs = observable<ResultEnvelope | null>(null);
      const prevStack: PrevCallback[] = [];
      const numListeners = observable(0);

      function walk({ index, op }: { index: number; op: Operation }) {
        const link = links[index];
        const prev: PrevCallback =
          index === 0
            ? (value: ResultEnvelope) => obs.set(value)
            : prevStack[index - 1];

        link({
          op,
          prev,
          next: (op, prevOp) => {
            prevStack[index] = prevOp;
            walk({ index: index + 1, op });
          },
          onDestroy: (callback) => {
            const unsub = numListeners.subscribe({
              onNext(subs) {
                if (subs === 0) {
                  callback();
                  unsub();
                }
              },
            });
          },
        });
      }
      walk({ index: 0, op: _op });
      return {
        get: obs.get,
        subscribe: (callback: (value: ResultEnvelope) => void) => {
          numListeners.set(numListeners.get() + 1);

          return obs.subscribe({
            onNext: (v) => {
              if (v) {
                callback(v);
              }
            },
            onDone() {
              numListeners.set(numListeners.get() - 1);
            },
          });
        },
      };
    },
  };
}
