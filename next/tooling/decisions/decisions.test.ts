import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { expect, test } from 'vite-plus/test';
import {
  decisionsDir,
  InvalidDecision,
  parseDecision,
  questionIndex,
  readDecisions,
} from './decisions.ts';

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const decisions = await run(readDecisions());

test('every decision says who made it and where it lives', () => {
  expect(decisions.length).toBeGreaterThan(0);
  for (const d of decisions) {
    expect(d.file).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.md$/);
    expect(d.livesIn, `${d.file} has no "- Lives in:" bullet`).toBeTruthy();
  }
});

test('links between decisions and notes resolve', async () => {
  const missing = await run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const links = decisions.flatMap((d) =>
        [...d.text.matchAll(/\]\((\.{1,2}\/[^)#]+)(#[^)]*)?\)/g)].map(
          ([, target]) => ({ file: d.file, target: target! }),
        ),
      );
      const exists = yield* Effect.forEach(links, (opts) =>
        fs.exists(path.resolve(decisionsDir, opts.target)),
      );
      return links
        .filter((_, i) => !exists[i])
        .map((opts) => `${opts.file} links to ${opts.target}`);
    }),
  );
  expect(missing).toEqual([]);
});

test('every proposal question is cited by a decision', async () => {
  const index = await run(questionIndex(decisions));
  expect(index.length).toBeGreaterThan(100);
  expect(
    index.filter((q) => q.decisions.length === 0).map((q) => q.question),
  ).toEqual([]);
});

test('parses who, questions, open items, tentative answers and agent bullets', () => {
  const d = Effect.runSync(
    parseDecision(
      'example.md',
      [
        '# Errors are inferred (human)',
        '',
        '- Human (Q7.2): "A".',
        '- Tentative (human): "might change". Challenge it when it gets in the way.',
        '- (agent) Declared errors stay optional.',
        '  More about it.',
        '- Open: OpenAPI (Q18.1).',
        '- Lives in: `src/errors.ts`.',
      ].join('\n'),
    ),
  );
  expect(d).toMatchObject({
    who: 'human',
    title: 'Errors are inferred',
    questions: ['Q7.2', 'Q18.1'],
    open: ['Open: OpenAPI (Q18.1).'],
    tentative: [
      'Tentative (human): "might change". Challenge it when it gets in the way.',
    ],
    agentBullets: ['(agent) Declared errors stay optional.\n  More about it.'],
    livesIn: '`src/errors.ts`.',
  });
  const invalid = Effect.runSync(
    Effect.flip(parseDecision('bad.md', '# No marker\n')),
  );
  expect(invalid).toBeInstanceOf(InvalidDecision);
  expect(invalid.message).toMatch(/first line/);
});
