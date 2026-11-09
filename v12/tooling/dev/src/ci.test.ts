import { readFileSync } from 'node:fs';

import { assert, describe, it } from '@effect/vitest';
import { Duration, Effect, Predicate } from 'effect';

import { pushPaths, type Run, Verdict, verdict, waitForRun } from './ci.ts';

const run = (headSha: string, status: string, conclusion = ''): Run => ({
  databaseId: headSha.length,
  headSha,
  status,
  conclusion,
  url: `https://ci/${headSha}`,
});

describe('verdict', () => {
  it('waits while no run has finished', () => {
    const running = run('b', 'in_progress');
    assert.deepStrictEqual(
      verdict([
        run('c', 'queued'),
        running,
        run('a', 'completed', 'cancelled'),
      ]),
      Verdict.Pending({ running: [run('c', 'queued'), running] }),
    );
  });

  it('takes the oldest finished run, skipping cancelled ones', () => {
    assert.deepStrictEqual(
      verdict([
        run('d', 'completed', 'success'),
        run('c', 'in_progress'),
        run('b', 'completed', 'failure'),
        run('a', 'completed', 'cancelled'),
      ]),
      Verdict.Finished({
        run: run('b', 'completed', 'failure'),
        later: [run('d', 'completed', 'success')],
      }),
    );
  });
});

describe('waitForRun', () => {
  it.effect('polls until a run that includes the commit finishes', () =>
    Effect.gen(function* () {
      const polls = [
        [run('b', 'in_progress'), run('a', 'completed', 'success')],
        [run('b', 'completed', 'success'), run('a', 'completed', 'success')],
      ];
      let poll = 0;
      const result = yield* waitForRun(
        {
          runs: Effect.sync(
            () => polls[Math.min(poll++, polls.length - 1)] ?? [],
          ),
          // `a` is older than the commit.
          covers: (headSha) => Effect.succeed(headSha !== 'a'),
        },
        { interval: Duration.zero, timeout: Duration.minutes(1) },
      );
      assert.deepStrictEqual(result.run, run('b', 'completed', 'success'));
      assert.strictEqual(poll, 2);
    }),
  );

  it.effect('gives up at the timeout', () =>
    Effect.gen(function* () {
      const error = yield* waitForRun(
        {
          runs: Effect.succeed([run('a', 'queued')]),
          covers: () => Effect.succeed(true),
        },
        { interval: Duration.zero, timeout: Duration.zero },
      ).pipe(Effect.flip);
      assert.isTrue(Predicate.isTagged(error, 'CiTimeout'));
    }),
  );
});

describe('pushPaths', () => {
  it("reads the push trigger's paths as pathspecs", () => {
    const workflow = [
      'on:',
      '  push:',
      '    branches: [v12]',
      '    paths:',
      "      - 'v12/**'",
      '      # The docs.',
      "      - 'www/**'",
      '',
      "      - 'turbo.json'",
      '  pull_request:',
      '    paths:',
      "      - 'other/**'",
    ].join('\n');
    assert.deepStrictEqual(pushPaths(workflow), ['v12', 'www', 'turbo.json']);
  });

  it("reads next.yml's", () => {
    const workflow = readFileSync(
      new URL('../../../../.github/workflows/next.yml', import.meta.url),
      'utf8',
    );
    const paths = pushPaths(workflow);
    assert.includeMembers([...paths], ['v12', 'www', 'turbo.json']);
    assert.notInclude(paths.join(' '), '*');
  });
});
