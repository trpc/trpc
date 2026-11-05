import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { rethrowAsync } from './utils';

/**
 * A `DisposableStack`-style scope, which not every supported runtime has.
 * Cleanups run once, newest first, and one that throws is rethrown
 * asynchronously without stopping the others.
 */
export interface Scope extends Disposable {
  /** Runs `cleanup` when the scope is disposed. */
  defer: (cleanup: () => void) => void;
  /** Disposes `resource` with the scope, and returns it. */
  use: <TResource extends Disposable>(resource: TResource) => TResource;
  readonly disposed: boolean;
}

export function createScope(): Scope {
  const cleanups: (() => void)[] = [];
  const scope = {
    disposed: false,
    defer(cleanup: () => void) {
      if (scope.disposed) {
        runCleanup(cleanup);
        return;
      }
      cleanups.push(cleanup);
    },
    use<TResource extends Disposable>(resource: TResource) {
      scope.defer(() => dispose(resource));
      return resource;
    },
  };
  return makeResource(scope, () => {
    if (scope.disposed) return;
    scope.disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) runCleanup(cleanup);
  });
}

function runCleanup(cleanup: () => void) {
  try {
    cleanup();
  } catch (error) {
    rethrowAsync(error);
  }
}

/** Disposes a resource that outlives the block it was made in. */
export function dispose(resource: Disposable) {
  // oxlint-disable-next-line trpc/no-symbol-dispose
  resource[Symbol.dispose]();
}

/** A `setTimeout` that is cleared when disposed. */
export function timeoutResource(callback: () => void, ms: number) {
  const timer = setTimeout(callback, ms);
  return makeResource({}, () => clearTimeout(timer));
}

/** A WebSocket listener that is removed when disposed. */
export function listenerResource<TType extends keyof WebSocketEventMap>(
  ws: WebSocket,
  type: TType,
  listener: (event: WebSocketEventMap[TType]) => void,
) {
  ws.addEventListener(type, listener);
  return makeResource({}, () => ws.removeEventListener(type, listener));
}
