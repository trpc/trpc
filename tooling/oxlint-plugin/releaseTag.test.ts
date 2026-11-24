import { join } from 'node:path';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const src = join(import.meta.dirname, 'fixtures/pkg/src');
// `reached` and `Reached` are exported from the package's `.` entry point.
const reachedFile = join(src, 'reached.ts');
const otherFile = join(src, 'other.ts');
const internalsFile = join(src, 'internals/thing.ts');

const missing = (name: string) =>
  `\`${name}\` is exported, so its JSDoc says \`@public\` (for users) or \`@internal\` (for tRPC itself)`;
const inInternals = (name: string, path: string) =>
  `\`${name}\` is \`@public\`, but \`${path}\` is for internals: move it out, or tag it \`@internal\``;

tester.run('release-tag', plugin.rules['release-tag']!, {
  valid: [
    { code: '/** @internal */\nexport function f() {}', filename: otherFile },
    { code: '/** @public */\nexport function f() {}', filename: otherFile },
    { code: 'function f() {}', filename: otherFile },
    // The tag is a hint: what an entry point exports may still be internal.
    {
      code: '/** @internal */\nexport function reached() {}',
      filename: reachedFile,
    },
    // Overloads share the first signature's JSDoc.
    {
      code: '/** @internal */\nexport function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: unknown) {}',
      filename: otherFile,
    },
    // A checkout under a folder named `internal` isn't internals.
    {
      code: '/** @public */\nexport const x = 1;',
      filename: join(import.meta.dirname, 'fixtures/internal/pkg/src/index.ts'),
    },
    { code: '/** @internal */\nexport const x = 1;', filename: internalsFile },
    {
      code: '/** @internal */\nexport const x = 1;',
      filename: join(src, 'unstable-internals.ts'),
    },
  ],
  invalid: [
    {
      code: 'export function f() {}',
      filename: otherFile,
      output: '/** @internal */\nexport function f() {}',
      errors: [{ message: missing('f') }],
    },
    // What an entry point exports from outside internals is likely public.
    {
      code: 'export function reached() {}',
      filename: reachedFile,
      output: '/** @public */\nexport function reached() {}',
      errors: [{ message: missing('reached') }],
    },
    // Reached through `export * as ns`, a default import and a default
    // re-export.
    {
      code: 'export const inNamespace = 1;',
      filename: join(src, 'ns.ts'),
      output: '/** @public */\nexport const inNamespace = 1;',
      errors: [{ message: missing('inNamespace') }],
    },
    {
      code: 'const api = 1;\nexport { api as default };',
      filename: join(src, 'api.ts'),
      output: '/** @public */\nconst api = 1;\nexport { api as default };',
      errors: [{ message: missing('api') }],
    },
    {
      code: 'export default function API(): number { return 1; }',
      filename: join(src, 'defaultApi.ts'),
      output:
        '/** @public */\nexport default function API(): number { return 1; }',
      errors: [{ message: missing('API') }],
    },
    // `export *` reaches named exports, not `default`.
    {
      code: 'export const viaStar = 1;',
      filename: join(src, 'starred.ts'),
      output: '/** @public */\nexport const viaStar = 1;',
      errors: [{ message: missing('viaStar') }],
    },
    {
      code: 'export default function hidden(): number { return 1; }',
      filename: join(src, 'starred.ts'),
      output:
        '/** @internal */\nexport default function hidden(): number { return 1; }',
      errors: [{ message: missing('hidden') }],
    },
    {
      code: 'export default function () {}',
      filename: otherFile,
      output: '/** @internal */\nexport default function () {}',
      errors: [{ message: missing('default') }],
    },
    {
      code: '/** @public */\nexport default function () {}',
      filename: internalsFile,
      errors: [{ message: inInternals('default', 'internals/') }],
    },
    // Text that looks like an export in the entry point isn't one.
    {
      code: 'export interface NotReached {}',
      filename: reachedFile,
      output: '/** @internal */\nexport interface NotReached {}',
      errors: [{ message: missing('NotReached') }],
    },
    {
      code: '/** Does f. */\nexport function f() {}',
      filename: otherFile,
      output: '/**\n * Does f.\n * @internal\n */\nexport function f() {}',
      errors: [{ message: missing('f') }],
    },
    {
      code: '/**\n * Does f.\n */\nexport const f = 1;',
      filename: otherFile,
      output: '/**\n * Does f.\n * @internal\n */\nexport const f = 1;',
      errors: [{ message: missing('f') }],
    },
    {
      code: '// A note.\nexport type T = 1;',
      filename: otherFile,
      output: '/** @internal */\n// A note.\nexport type T = 1;',
      errors: [{ message: missing('T') }],
    },
    {
      code: 'function f() {}\nexport { f };',
      filename: otherFile,
      output: '/** @internal */\nfunction f() {}\nexport { f };',
      errors: [{ message: missing('f') }],
    },
    {
      code: 'export const { a, b } = { a: 1, b: 2 };',
      filename: otherFile,
      output: '/** @internal */\nexport const { a, b } = { a: 1, b: 2 };',
      errors: [{ message: missing('a') }],
    },
    {
      code: '/**\n * @public\n * @internal\n */\nexport type X = 1;',
      filename: otherFile,
      errors: [{ message: '`X` is both `@public` and `@internal`' }],
    },
    {
      code: '/** @public */\nexport const x = 1;',
      filename: internalsFile,
      errors: [{ message: inInternals('x', 'internals/') }],
    },
    {
      code: '/** @public */\ninterface Shape {}',
      filename: join(src, 'internals/deep/thing.ts'),
      errors: [{ message: inInternals('Shape', 'internals/') }],
    },
    {
      code: '/** @public */\nexport const x = 1;',
      filename: join(src, 'unstable-internals.ts'),
      errors: [{ message: inInternals('x', 'unstable-internals.ts') }],
    },
  ],
});
