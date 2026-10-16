# Retries pause while offline (agent)

- **Retries pause while offline** (`platform.ts` `whenOnline`, used by `attempt` in `entry.ts`): after the delay, a browser retry waits for the `Platform`'s `"online"` event if it reports offline; it's an `Effect.callback`, so interrupting the request removes the listener. Scoped to retries only: no TanStack `networkMode`, no `fetchStatus: "paused"`, and the first attempt isn't held back. No opt-out option yet.
