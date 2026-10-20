import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { expect, test } from 'vite-plus/test';
import { decisionsDir, readDecisions } from './decisions.ts';
import {
  InvalidOpenQuestion,
  openDir,
  parseOpenQuestion,
  readOpenQuestions,
  splitHeadings,
} from './open.ts';

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const questions = await run(readOpenQuestions());

test('every open question follows the template', () => {
  expect(questions.length).toBeGreaterThan(0);
});

test('links to files in the repo resolve', async () => {
  const missing = await run(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const links = questions.flatMap((q) => [
        ...q.links.map((link) => ({ file: q.file, target: link.url })),
        ...[
          q.why,
          ...q.options.map((option) => option.body),
          q.recommendation,
          q.blocked,
          q.details ?? '',
        ].flatMap((markdown) =>
          [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map(([, target]) => ({
            file: q.file,
            target: target!,
          })),
        ),
      ]);
      const local = links
        .map((link) => ({ ...link, target: link.target.split('#')[0]! }))
        .filter((link) => /^\.{1,2}\//.test(link.target));
      const exists = yield* Effect.forEach(local, (link) =>
        fs.exists(path.resolve(openDir, link.target)),
      );
      return local
        .filter((_, i) => !exists[i])
        .map((link) => `${link.file} links to ${link.target}`);
    }),
  );
  expect(missing).toEqual([]);
});

test('an open question cites no question a human already answered', async () => {
  const decisions = await run(readDecisions(decisionsDir));
  const answered = new Set(
    decisions
      .filter((d) => d.who !== 'agent')
      .flatMap((d) =>
        [...d.text.matchAll(/^- Human, [^(]*\((Q\d+\.\d+)/gm)].map(
          ([, q]) => q!,
        ),
      ),
  );
  expect(
    questions.flatMap((q) =>
      q.questions
        .filter((n) => answered.has(n))
        .map((n) => `${q.file}: ${n} has a human's answer`),
    ),
  ).toEqual([]);
});

const valid = [
  '---',
  'title: Should it be blue?',
  'summary: The color.',
  'area: client',
  'recommended: B',
  'links:',
  '  - { kind: pr, label: "#1", url: "https://github.com/trpc/trpc/pull/1" }',
  '  - { kind: decision, label: color, url: ../decisions/color.md }',
  '---',
  '',
  '# Should it be blue?',
  '',
  '## Why it matters',
  '',
  'Because.',
  '',
  '## Options',
  '',
  '### A) Red',
  '',
  '```ts',
  '## not a heading',
  'paint("red");',
  '```',
  '',
  '- ✅ Warm',
  '- ❌ Loud',
  '',
  '### B) Blue',
  '',
  '```ts',
  'paint("blue");',
  '```',
  '',
  '- ✅ Calm',
  '- ❌ Cold',
  '',
  '## Recommendation',
  '',
  '**B.**',
  '',
  '## Blocked until answered',
  '',
  '- Nothing.',
].join('\n');

test('parses the frontmatter, sections and options', () => {
  const q = Effect.runSync(parseOpenQuestion('blue.md', valid));
  expect(q).toMatchObject({
    area: 'client',
    blocked: '- Nothing.',
    details: undefined,
    recommendation: '**B.**',
    recommended: 'B',
    slug: 'blue',
    summary: 'The color.',
    title: 'Should it be blue?',
    why: 'Because.',
  });
  expect(q.options.map((o) => [o.id, o.title])).toEqual([
    ['A', 'Red'],
    ['B', 'Blue'],
  ]);
  expect(q.options[0]!.body).toContain('## not a heading');
});

test('reports what breaks the template', () => {
  const broken = valid
    .replace('recommended: B', 'recommended: C')
    .replace('### B) Blue', '### C) Blue')
    .replace('paint("blue");\n```\n\n- ✅ Calm', 'no code\n\n- ✅ Calm')
    .replace('## Blocked until answered\n\n- Nothing.', '')
    .replace('area: client', 'area: colors');
  const error = Effect.runSync(
    Effect.flip(parseOpenQuestion('Blue.md', broken)),
  );
  expect(error).toBeInstanceOf(InvalidOpenQuestion);
  expect(error.message).toMatch(/frontmatter/);
  const fixedArea = broken.replace('area: colors', 'area: client');
  const message = Effect.runSync(
    Effect.flip(parseOpenQuestion('Blue.md', fixedArea)),
  ).message;
  expect(message).toMatch(/kebab-case/);
  expect(message).toMatch(/"### B\) <title>"/);
  expect(message).toMatch(/sections must be/);
  expect(message).toMatch(/recommended: C names no option/);
});

test('splits headings outside code only', () => {
  expect(
    splitHeadings('lead\n## A\none\n~~~\n## B\n~~~\n## C\ntwo', 2),
  ).toEqual({
    lead: 'lead',
    parts: [
      ['A', 'one\n~~~\n## B\n~~~'],
      ['C', 'two'],
    ],
  });
});
