import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);

/** The variables the typography plugin sets its colors with */
function pluginColors(): string[] {
  const styles: Record<
    string,
    { css: Record<string, string> }
  > = require('@tailwindcss/typography/src/styles.js');
  return Object.keys(styles['gray']?.css ?? {}).filter((name) =>
    name.startsWith('--tw-prose-'),
  );
}

test('the site sets every color of the typography plugin, so none is for one theme only', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const prose = /\n\.prose \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const set = new Set(
    [...prose.matchAll(/(--tw-prose-[\w-]+):/g)].map((match) => match[1]),
  );

  expect(pluginColors()).toContain('--tw-prose-pre-code');
  expect(pluginColors().filter((name) => !set.has(name))).toEqual([]);
});
