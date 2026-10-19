import { Duration, Effect } from 'effect';

/** Drains one connection within `timeout`: asks its client to move, waits, closes. @internal */
export type DrainConnection = (
  timeout: Duration.Duration,
) => Effect.Effect<void>;

/** The socket connections a handler serves, so it can drain them. @internal */
export interface SocketDrains {
  /**
   * Adds a connection and returns what removes it, or `undefined` while
   * the handler is `refusing`.
   */
  readonly add: (drain: DrainConnection) => (() => void) | undefined;
  /**
   * Whether the handler takes no new connections: a drain runs, a `hold`
   * is on, or the final drain ran. Upgrades are answered 503 then.
   */
  readonly refusing: () => boolean;
  /** Refuses new connections until the returned function runs. */
  readonly hold: () => () => void;
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
  let holds = 0;
  let final = false;
  const refusing = () => final || holds > 0;
  const hold = () => {
    holds++;
    let held = true;
    return () => {
      if (held) holds--;
      held = false;
    };
  };
  return {
    add: (drain) => {
      if (refusing()) return undefined;
      open.add(drain);
      return () => {
        open.delete(drain);
      };
    },
    refusing,
    hold,
    drain: (opts = {}) =>
      Effect.suspend(() => {
        const release = hold();
        if (opts.final) final = true;
        const timeout = Duration.fromInputUnsafe(
          opts.timeout ?? defaultTimeout,
        );
        return Effect.forEach([...open], (drain) => drain(timeout), {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(Effect.ensuring(Effect.sync(release)));
      }),
  };
};
