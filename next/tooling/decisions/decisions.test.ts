import { existsSync } from 'node:fs';
import { expect, test } from 'vite-plus/test';
import {
  decisionsDir,
  parseDecision,
  questionIndex,
  readDecisions,
} from './decisions.ts';

const decisions = readDecisions();

test('every decision says who made it and where it lives', () => {
  expect(decisions.length).toBeGreaterThan(0);
  for (const d of decisions) {
    expect(d.file).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.md$/);
    expect(d.livesIn, `${d.file} has no "- Lives in:" bullet`).toBeTruthy();
  }
});

test('links between decisions and notes resolve', () => {
  for (const d of decisions) {
    for (const [, target] of d.text.matchAll(
      /\]\((\.{1,2}\/[^)#]+)(#[^)]*)?\)/g,
    )) {
      expect(
        existsSync(new URL(target!, decisionsDir)),
        `${d.file} links to ${target}`,
      ).toBe(true);
    }
  }
});

test('every proposal question is cited by a decision', () => {
  const index = questionIndex(decisions);
  expect(index.length).toBeGreaterThan(100);
  expect(
    index.filter((q) => q.decisions.length === 0).map((q) => q.question),
  ).toEqual([]);
});

test('parses who, questions, open items and agent bullets', () => {
  const d = parseDecision(
    'example.md',
    [
      '# Errors are inferred (human)',
      '',
      '- Alex (Q7.2): "A".',
      '- (agent) Declared errors stay optional.',
      '  More about it.',
      '- Open: OpenAPI (Q18.1).',
      '- Lives in: `src/errors.ts`.',
    ].join('\n'),
  );
  expect(d).toMatchObject({
    who: 'human',
    title: 'Errors are inferred',
    questions: ['Q7.2', 'Q18.1'],
    open: ['Open: OpenAPI (Q18.1).'],
    agentBullets: ['(agent) Declared errors stay optional.\n  More about it.'],
    livesIn: '`src/errors.ts`.',
  });
  expect(() => parseDecision('bad.md', '# No marker\n')).toThrow(/first line/);
});
