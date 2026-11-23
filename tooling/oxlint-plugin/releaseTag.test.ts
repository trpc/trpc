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

const missing = (name: string) =>
  `\`${name}\` is exported, so its JSDoc says \`@public\` (changing it needs a major release) or \`@internal\` (a minor may change it)`;
const reachable = (name: string) =>
  `\`${name}\` is exported from a versioned entry point, so it's \`@public\``;
const leak = (name: string, ref: string, where = '') =>
  `\`${name}\` is \`@public\`, but its type uses \`${ref}\`, which is \`@internal\`${where}: make \`${ref}\` \`@public\`, or keep it out of the type`;

tester.run('release-tag', plugin.rules['release-tag']!, {
  valid: [
    { code: '/** @internal */\nexport function f() {}', filename: otherFile },
    { code: '/** @public */\nexport function f() {}', filename: otherFile },
    { code: 'function f() {}', filename: otherFile },
    // Overloads share the first signature's JSDoc.
    {
      code: '/** @internal */\nexport function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: unknown) {}',
      filename: otherFile,
    },
    // Only reachable through `unstable-core-do-not-import`.
    {
      code: '/** @public */\nexport function reached() {}\n/** @public */\nexport interface Reached {}\n/** @internal */\nexport interface NotReached {}',
      filename: reachedFile,
    },
    {
      code: "import type { Shown } from './internal';\n/** @public */\nexport type X = Shown;",
      filename: otherFile,
    },
    {
      code: "import type { Hidden } from './internal';\n/** @internal */\nexport type X = Hidden;",
      filename: otherFile,
    },
    {
      code: 'interface Local {}\n/** @public */\nexport type X = Local;',
      filename: otherFile,
    },
    // What a function body doesn't return isn't part of its type.
    {
      code: "import type { Hidden } from './internal';\n/** @public */\nexport function f() { const x = {} as Hidden; return 1; }",
      filename: otherFile,
    },
    {
      code: '/** @internal */\nexport class C {}\n/** @public */\nexport function f() { return new C() as unknown as undefined; }',
      filename: otherFile,
    },
    // A type parameter isn't the declaration it shadows.
    {
      code: '/** @internal */\nexport interface Options {}\n/** @public */\nexport function identity<Options>(value: Options): Options { return value; }',
      filename: otherFile,
    },
    // `export * as ns` makes what `ns.ts` exports reachable.
    {
      code: '/** @public */\nexport const inNamespace = 1;',
      filename: join(src, 'ns.ts'),
    },
  ],
  invalid: [
    {
      code: 'export function f() {}',
      filename: otherFile,
      output: '/** @internal */\nexport function f() {}',
      errors: [{ message: missing('f') }],
    },
    {
      code: 'export function reached() {}',
      filename: reachedFile,
      output: '/** @public */\nexport function reached() {}',
      errors: [{ message: missing('reached') }],
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
      code: '/**\n * @public\n * @internal\n */\nexport type X = 1;',
      filename: otherFile,
      errors: [{ message: '`X` is both `@public` and `@internal`' }],
    },
    {
      code: '/** @internal */\nexport function reached() {}',
      filename: reachedFile,
      output: '/** @public */\nexport function reached() {}',
      errors: [{ message: reachable('reached') }],
    },
    {
      code: '/** @internal */\nexport type A = 1;\n/** @public */\nexport type B = A;',
      filename: otherFile,
      errors: [{ message: leak('B', 'A') }],
    },
    {
      code: '/** @internal */\nexport type A = 1;\ntype L = { a: A };\n/** @public */\nexport type B = L;',
      filename: otherFile,
      errors: [{ message: leak('B', 'A') }],
    },
    {
      code: 'export const { a, b } = { a: 1, b: 2 };',
      filename: otherFile,
      output: '/** @internal */\nexport const { a, b } = { a: 1, b: 2 };',
      errors: [{ message: missing('a') }],
    },
    {
      code: '/** @internal */\nexport const inNamespace = 1;',
      filename: join(src, 'ns.ts'),
      output: '/** @public */\nexport const inNamespace = 1;',
      errors: [{ message: reachable('inNamespace') }],
    },
    {
      code: "import type { Hidden } from './internal';\n/** @public */\nexport function f() { return {} as Hidden; }",
      filename: otherFile,
      errors: [{ message: leak('f', 'Hidden', ' in `internal.ts`') }],
    },
    {
      code: '/** @internal */\nexport class C {}\n/** @public */\nexport const make = () => new C();',
      filename: otherFile,
      errors: [{ message: leak('make', 'C') }],
    },
    {
      code: '/** @internal */\ninterface Hidden {}\n/** @public */\nexport type Options = Hidden;',
      filename: otherFile,
      errors: [{ message: leak('Options', 'Hidden') }],
    },
    {
      code: "import type { Hidden } from './internal';\n/** @public */\nexport function f(opts: Hidden) {}",
      filename: otherFile,
      errors: [{ message: leak('f', 'Hidden', ' in `internal.ts`') }],
    },
    // Reachable, so public even while tagged `@internal`.
    {
      code: "import type { Hidden } from './internal';\n/** @internal */\nexport interface Reached extends Hidden {}",
      filename: reachedFile,
      output:
        "import type { Hidden } from './internal';\n/** @public */\nexport interface Reached extends Hidden {}",
      errors: [
        { message: reachable('Reached') },
        { message: leak('Reached', 'Hidden', ' in `internal.ts`') },
      ],
    },
  ],
});
