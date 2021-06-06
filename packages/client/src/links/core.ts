import { observable } from '../observable';

export type Operation<TInput = unknown> = {
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
};
export type ResultEnvelope<TOutput = unknown> =
  | {
      ok: true;
      data: TOutput;
    }
  | {
      ok: false;
      error: Error;
    };

export type PrevCallback = (result: ResultEnvelope) => void;
export type ContextLink = (opts: {
  op: Operation;
  prev: PrevCallback;
  next: (op: Operation, callback: PrevCallback) => void;
  onDestroy: (callback: () => void) => void;
}) => void;

export type AppLink = () => ContextLink;

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
