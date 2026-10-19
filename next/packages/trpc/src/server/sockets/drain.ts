import { Duration, Effect } from 'effect';

/** Drains one connection within `timeout`: asks its client to move, waits, closes. @internal */
export type DrainConnection = (
  timeout: Duration.Duration,
) => Effect.Effect<void>;

/** The socket connections a handler serves, so it can drain them. @internal */
export interface SocketDrains {
  /**
   * Adds a connection and returns what removes it, or `undefined` while a
   * drain runs or after the final one: the handler takes no connections then.
   */
  readonly add: (drain: DrainConnection) => (() => void) | undefined;
  /**
   * Drains every open connection at once. With `final`, the handler never
   * takes another one.
   */
  readonly drain: (opts?: {
    readonly timeout?: Duration.Input | undefined;
    readonly final?: boolean;
  }) => Effect.Effect<void>;
}

/** @internal */
export const makeSocketDrains = (
  defaultTimeout: Duration.Input,
): SocketDrains => {
  const open = new Set<DrainConnection>();
  let draining = 0;
  let final = false;
  return {
    add: (drain) => {
      if (final || draining > 0) return undefined;
      open.add(drain);
      return () => {
        open.delete(drain);
      };
    },
    drain: (opts = {}) =>
      Effect.suspend(() => {
        draining++;
        if (opts.final) final = true;
        const timeout = Duration.fromInputUnsafe(
          opts.timeout ?? defaultTimeout,
        );
        return Effect.forEach([...open], (drain) => drain(timeout), {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              draining--;
            }),
          ),
        );
      }),
  };
};
