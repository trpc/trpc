import { Context, Duration, Effect } from 'effect';

/** A connection a handler can ask to move. @internal */
export interface DrainConnection {
  /** Asks its client to move within `timeout`, waits for it, then closes. */
  readonly drain: (timeout: Duration.Duration) => Effect.Effect<void>;
  /** Asks its client to move within `drainIn`, and keeps serving it. */
  readonly notify: (drainIn: Duration.Duration) => Effect.Effect<void>;
}

/**
 * A notice's `drainIn`: the milliseconds until the server closes the
 * connection, or `null` for no deadline.
 * @internal
 */
export const drainInMillis = (drainIn: Duration.Duration): number | null =>
  Duration.isFinite(drainIn) ? Math.round(Duration.toMillis(drainIn)) : null;

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
  /**
   * Asks every open connection's client to move within `drainIn`, without
   * draining: connections stay open and new ones are taken. A notice its
   * client doesn't read by then is given up.
   */
  readonly broadcast: (drainIn: Duration.Input) => Effect.Effect<void>;
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
        return Effect.forEach([...open], (c) => c.drain(timeout), {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(Effect.ensuring(Effect.sync(release)));
      }),
    broadcast: (input) =>
      Effect.suspend(() => {
        const drainIn = Duration.fromInputUnsafe(input);
        if (Duration.isNegative(drainIn)) {
          return Effect.die(
            new Error(
              `broadcastReconnect: drainIn must be zero or more, got ${Duration.format(drainIn)}`,
            ),
          );
        }
        return Effect.forEach(
          [...open],
          (c) => Effect.timeoutOption(c.notify(drainIn), drainIn),
          { concurrency: 'unbounded', discard: true },
        );
      }),
  };
};

/** @internal */
export interface HandlerDrains {
  readonly _: unique symbol;
}

/**
 * The socket connections of one of our handlers (the v12 one or
 * `createV11Handler`), so `serve()` drains them before the server stops
 * and refuses upgrades meanwhile.
 * @internal
 */
export const HandlerDrains: Context.ServiceClass<
  HandlerDrains,
  '@trpc12/trpc/HandlerDrains',
  SocketDrains
> = /* @__PURE__ */ Context.Service<HandlerDrains, SocketDrains>()(
  '@trpc12/trpc/HandlerDrains',
);
