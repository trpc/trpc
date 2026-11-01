import { readdirSync } from 'node:fs';

import { describe, expect, it } from '@effect/vitest';

import {
  decisionHref,
  type DecisionsOptions,
  rewriteLinks,
  splitProsCons,
} from './decisions-content.ts';

const options: Pick<DecisionsOptions, 'basePath' | 'dirInRepo' | 'repoUrl'> = {
  basePath: '/v12/decisions',
  dirInRepo: 'next/.agent-docs',
  repoUrl: 'https://github.com/trpc/trpc/blob/v12',
};

describe('decisionHref', () => {
  it('points open questions and decisions at their pages', () => {
    expect(decisionHref(options, 'open/a.md', './b.md')).toBe(
      '/v12/decisions/open/b',
    );
    expect(decisionHref(options, 'open/a.md', '../decisions/c.md#why')).toBe(
      '/v12/decisions/c#why',
    );
    expect(decisionHref(options, 'decisions/c.md', './d.md')).toBe(
      '/v12/decisions/d',
    );
    expect(decisionHref(options, 'decisions/c.md', '../open/a.md')).toBe(
      '/v12/decisions/open/a',
    );
  });

  it('points every other file at GitHub, by its path in the repo', () => {
    expect(decisionHref(options, 'open/a.md', './README.md')).toBe(
      'https://github.com/trpc/trpc/blob/v12/next/.agent-docs/open/README.md',
    );
    expect(decisionHref(options, 'decisions/c.md', '../notes/n.md')).toBe(
      'https://github.com/trpc/trpc/blob/v12/next/.agent-docs/notes/n.md',
    );
    expect(
      decisionHref(options, 'open/a.md', '../../packages/trpc/src/x.ts'),
    ).toBe('https://github.com/trpc/trpc/blob/v12/next/packages/trpc/src/x.ts');
    expect(
      decisionHref(options, 'decisions/c.md', '../../../.agents/skills/s/'),
    ).toBe('https://github.com/trpc/trpc/blob/v12/.agents/skills/s/');
  });

  it('leaves URLs, anchors and site paths as written', () => {
    for (const url of ['https://trpc.io/docs', '#options', '/v12/docs/a']) {
      expect(decisionHref(options, 'open/a.md', url)).toBe(url);
    }
  });
});

describe('rewriteLinks', () => {
  it('rewrites links outside code only', () => {
    const markdown = [
      'See [b](./b.md) and `[c](./c.md)`.',
      '```ts',
      "const link = '[d](./d.md)';",
      '```',
      '[e](../decisions/e.md)',
    ].join('\n');
    expect(rewriteLinks(options, 'open/a.md', markdown)).toBe(
      [
        'See [b](/v12/decisions/open/b) and `[c](./c.md)`.',
        '```ts',
        "const link = '[d](./d.md)';",
        '```',
        '[e](/v12/decisions/e)',
      ].join('\n'),
    );
  });
});

describe('splitProsCons', () => {
  it("splits the marked bullets, with their continuation lines, from the option's prose", () => {
    const body = [
      'An option.',
      '',
      '```ts',
      'call();',
      '```',
      '',
      '- ✅ Short',
      '- ❌ Long, and',
      '  more',
      '- ✅ Another',
    ].join('\n');
    expect(splitProsCons(body)).toEqual({
      cons: '- Long, and\n  more',
      pros: '- Short\n- Another',
      rest: 'An option.\n\n```ts\ncall();\n```',
    });
  });
});

describe('samples/decisions/open', () => {
  it("has only the stubs of open questions, deleted with the question's file", () => {
    const questions = new Set(
      readdirSync(new URL('../../.agent-docs/open', import.meta.url))
        .filter((file) => file.endsWith('.md'))
        .map((file) => file.slice(0, -'.md'.length)),
    );
    const orphans = readdirSync(
      new URL('../samples/decisions/open', import.meta.url),
    ).filter(
      (file) =>
        file !== 'tsconfig.json' && !questions.has(file.replace(/\.tsx?$/, '')),
    );
    expect(orphans).toEqual([]);
  });
});
