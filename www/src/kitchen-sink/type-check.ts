import type { DemoFile } from './modules.ts';
import type { TypeRequest, TypeResponse, TypeResults } from './ts-worker.ts';

/** A demo sample's type checker, in its worker. */
export interface TypeChecker {
  readonly check: (
    files: ReadonlyArray<DemoFile>,
  ) => Promise<TypeResults['check']>;
  readonly completions: (
    files: ReadonlyArray<DemoFile>,
    name: string,
    position: number,
  ) => Promise<TypeResults['completions']>;
  readonly quickInfo: (
    files: ReadonlyArray<DemoFile>,
    name: string,
    position: number,
  ) => Promise<TypeResults['quickInfo']>;
}

/**
 * Started checkers, by sample, for as long as the page is open: a frame
 * that moves at the `xl` breakpoint finds its checker loaded.
 */
const checkers = new Map<string, TypeChecker>();

/** The sample's checker, if an editor of its demo was focused before. */
export function startedTypeChecker(sample: string) {
  return checkers.get(sample);
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/**
 * The sample's checker, starting its worker the first time: TypeScript
 * and the declarations load then, a few megabytes the page doesn't need
 * until someone edits the code.
 */
export function typeCheckerFor(sample: string): TypeChecker {
  const existing = checkers.get(sample);
  if (existing) {
    return existing;
  }
  const worker = new Worker(new URL('./ts-worker.ts', import.meta.url), {
    name: sample,
    type: 'module',
  });
  const pending = new Map<
    number,
    { reject: (cause: Error) => void; resolve: (result: unknown) => void }
  >();
  let ids = 0;
  let failure: Error | undefined;
  worker.addEventListener('message', (event: MessageEvent<TypeResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    pending.delete(response.id);
    if ('error' in response) {
      waiting?.reject(new Error(response.error));
    } else {
      waiting?.resolve(response.result);
    }
  });
  worker.addEventListener('error', (event) => {
    failure = new Error(event.message || "The type checker didn't load");
    for (const waiting of pending.values()) {
      waiting.reject(failure);
    }
    pending.clear();
  });
  const send = (request: WithoutId<TypeRequest>) =>
    new Promise<unknown>((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      ids += 1;
      pending.set(ids, { reject, resolve });
      worker.postMessage({ ...request, id: ids } satisfies TypeRequest);
    });
  // SAFETY: the worker answers each request with its type's result.
  const checker: TypeChecker = {
    check: (files) =>
      send({ files, type: 'check' }) as Promise<TypeResults['check']>,
    completions: (files, name, position) =>
      send({ files, name, position, type: 'completions' }) as Promise<
        TypeResults['completions']
      >,
    quickInfo: (files, name, position) =>
      send({ files, name, position, type: 'quickInfo' }) as Promise<
        TypeResults['quickInfo']
      >,
  };
  checkers.set(sample, checker);
  return checker;
}
