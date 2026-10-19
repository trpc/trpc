import { fileURLToPath } from 'node:url';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const fixture = (path: string) =>
  fileURLToPath(new URL(`fixtures/${path}`, import.meta.url));
const thing = fixture('stable/thing.ts');
const experimental = fixture('experimental/index.ts');
const unstablePackage = fixture('unstable/index.ts');

const doc = (...tags: string[]) =>
  ['/**', ' * Does a thing.', ...tags.map((tag) => ` * ${tag}`), ' */'].join(
    '\n',
  );
const stable = doc('@since 12.0.0', '@stability stable');
const draft = doc('@since 12.0.0', '@stability experimental');
const unstable = doc('@since 12.0.0', '@stability unstable');

tester.run('jsdoc', plugin.rules['jsdoc']!, {
  valid: [
    {
      filename: thing,
      code: `${stable}\nexport const createThing = () => {};`,
    },
    { filename: thing, code: `export const helper = () => {};` },
    {
      filename: thing,
      code: `${draft}\nexport const experimental_draft = () => {};`,
    },
    { filename: thing, code: `${draft}\nexport interface Shape {}` },
    {
      filename: thing,
      code: `${doc('@since 12.0.0', '@stability stable', '@deprecated Use `createThing`')}\nexport const experimental_done = createThing;`,
    },
    {
      filename: thing,
      code: `${stable}\nexport function createThing(name: string): void;\nexport function createThing(name: unknown) {}`,
    },
    {
      filename: thing,
      code: `${stable}\n@Injectable()\nexport class Service {}`,
    },
    {
      filename: fixture('stable/internal.ts'),
      code: `export const hidden = 1;`,
    },
    { filename: experimental, code: `${draft}\nexport const atom = 1;` },
    {
      filename: thing,
      code: `${unstable}\nexport const unstable_draft = () => {};`,
    },
    { filename: thing, code: `${unstable}\nexport interface Shape {}` },
    {
      filename: thing,
      code: `${doc('@since 12.0.0', '@stability unstable', '@deprecated Use `unstable_draft`')}\nexport const experimental_draft = unstable_draft;`,
    },
    {
      filename: thing,
      code: `${doc('@since 12.0.0', '@stability stable', '@deprecated Use `createThing`')}\nexport const unstable_done = createThing;`,
    },
  ],
  invalid: [
    {
      filename: thing,
      code: `export const createThing = () => {};`,
      errors: [
        {
          messageId: 'missing',
          data: { name: 'createThing', missing: '`@since` and `@stability`' },
        },
      ],
    },
    {
      filename: thing,
      code: `${doc('@since 12.0.0')}\nexport const createThing = () => {};`,
      errors: [
        {
          messageId: 'missing',
          data: { name: 'createThing', missing: '`@stability`' },
        },
      ],
    },
    {
      filename: thing,
      code: `${doc('@since 12.0.0', '@stability stable', '@deprecated')}\nexport const legacy = () => {};`,
      errors: [{ messageId: 'replacement', data: { name: 'legacy' } }],
    },
    {
      filename: thing,
      code: `${draft}\nexport const draft = () => {};`,
      errors: [
        {
          messageId: 'prefix',
          data: { name: 'draft', stage: 'experimental' },
        },
      ],
    },
    {
      filename: thing,
      code: `${stable}\nexport const experimental_done = () => {};`,
      errors: [
        {
          messageId: 'promoted',
          data: {
            name: 'experimental_done',
            next: '`unstable_done` or `done`',
            stage: 'experimental',
          },
        },
      ],
    },
    {
      filename: experimental,
      code: `${stable}\nexport const atom = 1;`,
      errors: [{ messageId: 'packageStability', data: { name: 'atom' } }],
    },
    {
      filename: experimental,
      code: `${draft}\nexport const experimental_atom = 1;`,
      errors: [
        {
          messageId: 'packagePrefix',
          data: { name: 'experimental_atom', unprefixed: 'atom' },
        },
      ],
    },
    {
      filename: experimental,
      code: `${draft}\nexport const unstable_atom = 1;`,
      errors: [
        {
          messageId: 'packagePrefix',
          data: { name: 'unstable_atom', unprefixed: 'atom' },
        },
      ],
    },
    {
      filename: thing,
      code: `${unstable}\nexport const draft = () => {};`,
      errors: [
        { messageId: 'prefix', data: { name: 'draft', stage: 'unstable' } },
      ],
    },
    {
      filename: thing,
      code: `${unstable}\nexport const experimental_draft = () => {};`,
      errors: [
        { messageId: 'prefix', data: { name: 'draft', stage: 'unstable' } },
      ],
    },
    {
      filename: thing,
      code: `${stable}\nexport const unstable_done = () => {};`,
      errors: [
        {
          messageId: 'promoted',
          data: {
            name: 'unstable_done',
            next: '`done`',
            stage: 'unstable',
          },
        },
      ],
    },
    {
      filename: thing,
      code: `${draft}\nexport const unstable_draft = () => {};`,
      errors: [
        {
          messageId: 'prefix',
          data: { name: 'draft', stage: 'experimental' },
        },
      ],
    },
    {
      filename: unstablePackage,
      code: `${unstable}\nexport const atom = 1;`,
      errors: [{ messageId: 'unstablePackage', data: { name: 'atom' } }],
    },
  ],
});
