import { Clock, Console, Data, Duration, Effect, Schema } from 'effect';

export const Run = Schema.Struct({
  databaseId: Schema.Number,
  headSha: Schema.String,
  status: Schema.String,
  conclusion: Schema.String,
  url: Schema.String,
});
export type Run = typeof Run.Type;

export type Verdict = Data.TaggedEnum<{
  Pending: { readonly running: ReadonlyArray<Run> };
  Finished: { readonly run: Run; readonly later: ReadonlyArray<Run> };
}>;
export const Verdict = Data.taggedEnum<Verdict>();

const unfinished = new Set(['cancelled', 'skipped', '']);

/**
 * Given the runs whose commit includes ours, newest first as `gh run list`
 * lists them: the oldest that finished without being cancelled, which ran
 * nearest to our commit, and the finished ones after it.
 */
export const verdict = (covering: ReadonlyArray<Run>): Verdict => {
  const finished = covering.filter(
    (run) => run.status === 'completed' && !unfinished.has(run.conclusion),
  );
  const first = finished.at(-1);
  return first === undefined
    ? Verdict.Pending({
        running: covering.filter((run) => run.status !== 'completed'),
      })
    : Verdict.Finished({ run: first, later: finished.slice(0, -1) });
};

export interface Ci<R> {
  /** The workflow's latest runs on the branch, newest first. */
  readonly runs: Effect.Effect<ReadonlyArray<Run>, unknown, R>;
  /** Whether a run of `headSha` includes the commit waited for. */
  readonly covers: (headSha: string) => Effect.Effect<boolean, unknown, R>;
}

export class CiTimeout extends Data.TaggedError('CiTimeout')<{
  readonly message: string;
}> {}

/** Polls `ci` until a run that includes the commit finishes. */
export const waitForRun = <R>(
  ci: Ci<R>,
  options: {
    readonly interval: Duration.Duration;
    readonly timeout: Duration.Duration;
  },
) =>
  Effect.gen(function* () {
    const deadline =
      (yield* Clock.currentTimeMillis) + Duration.toMillis(options.timeout);
    for (;;) {
      const runs = yield* ci.runs;
      const result = verdict(
        yield* Effect.filter(runs, (run) => ci.covers(run.headSha)),
      );
      if (Verdict.$is('Finished')(result)) {
        return result;
      }
      if ((yield* Clock.currentTimeMillis) >= deadline) {
        return yield* new CiTimeout({
          message: `No run that includes the commit finished in ${Duration.format(options.timeout)}.`,
        });
      }
      yield* Console.log(
        result.running.length === 0
          ? 'No run includes the commit yet.'
          : `Waiting for ${result.running.map((run) => run.url).join(', ')}.`,
      );
      yield* Effect.sleep(options.interval);
    }
  });
