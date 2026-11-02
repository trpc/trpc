import { describe, expect, it } from 'vitest';

import { section, withoutHeadingIds } from './skills.ts';

const page = [
  '## Setup',
  '',
  'Install it.',
  '',
  '### Options {#options}',
  '',
  '```md',
  '## Not a heading',
  '```',
  '',
  '## Usage',
  '',
  'Call it.',
].join('\n');

describe('section', () => {
  it('finds a heading by its slug, up to the next of its level', () => {
    expect(section(page, 'setup')).toBe(
      page.slice(0, page.indexOf('## Usage')).trim(),
    );
  });

  it('finds a heading by its `{#id}`', () => {
    expect(section(page, 'options')).toMatch(/^### Options \{#options\}/);
    expect(section(page, 'options-options')).toBeUndefined();
  });

  it('ignores headings in code blocks', () => {
    expect(section(page, 'not-a-heading')).toBeUndefined();
  });
});

describe('withoutHeadingIds', () => {
  it('strips `{#id}` from headings outside code blocks', () => {
    expect(
      withoutHeadingIds('## Options {#options}\n\n```md\n## Kept {#kept}\n```'),
    ).toBe('## Options\n\n```md\n## Kept {#kept}\n```');
  });
});
