import { join } from 'node:path';
import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const optional = (name: string) =>
  `Internal parameter \`${name}\` is optional - make it required and pass \`null\`, \`undefined\`, a literal or a symbol`;
const defaulted = (name: string) =>
  `Internal parameter \`${name}\` has a default - make it required and pass the value at each call site`;
const option = (name: string) =>
  `Internal option \`${name}\` is optional - make it required and pass \`null\`, \`undefined\`, a literal or a symbol`;

tester.run('no-internal-optional', plugin.rules['no-internal-optional']!, {
  valid: [
    'function f(a: string | undefined, b: number | null) {}',
    'const f = (opts: { a: string | undefined }) => {};',
    // Exported functions are public API.
    'export function f(a?: string, b = 1) {}',
    'export const f = (opts: { a?: string }) => {};',
    'export default function f(a?: string) {}',
    'function f(a?: string) {}\nexport { f };',
    'function f(a?: string) {}\nexport { f as g };',
    'const f = (a?: string) => {};\nexport default f;',
    // Nested functions may be returned as public API.
    'function f() { return (a?: string) => {}; }',
    'export function f() { function g(a = 1) {} }',
    // Types a public declaration's type uses are public too.
    'interface Opts { a?: string }\nexport function f(opts: Opts) {}',
    'type Opts = { a?: string };\n/** @public */\nexport type Options = Opts;',
    // Untagged exports count as public; `trpc/release-tag` asks for a tag.
    'export interface Opts { a?: string }',
    '/** @public */\nexport interface Opts { a?: string }',
    '/** @public */\nexport function f(a?: string) {}',
    // A non-exported declaration can say it's public.
    '/** @public */\ninterface Shape { a?: string }',
    '/** @internal */\nexport interface Opts { a: string | undefined }',
    '/** @internal */\nexport function f(a: string | undefined) {}',
    'interface Worker { run(retries: number | undefined): void }',
    'function run(opts: { retry: number | undefined }[]) {}',
    // What a public function returns is public.
    'class Scratch { retry?: number }\nexport function make() { return new Scratch(); }',
    'class Result { retry?: number }\nexport function f() { return { result: new Result() } as const; }',
    'function f(opts: { a: string } | undefined) {}',
    'function f(opts: { a: string } & { b: number }) {}',
    // Named types aren't followed, even in a union.
    'function f(opts: Opts | undefined) {}',
  ],
  invalid: [
    {
      code: 'function f(a?: string) {}',
      errors: [{ message: optional('a') }],
    },
    {
      code: 'const f = (a?: string) => {};',
      errors: [{ message: optional('a') }],
    },
    {
      code: 'const f = function (a = 0) {};',
      errors: [{ message: defaulted('a') }],
    },
    {
      code: 'function f(depth: number = 0) {}',
      errors: [{ message: defaulted('depth') }],
    },
    {
      code: 'function f(opts: { a?: string; b(): void; c?(): void }) {}',
      errors: [{ message: option('a') }, { message: option('c') }],
    },
    {
      code: 'function f(opts: { retry?: number } | undefined) {}',
      errors: [{ message: option('retry') }],
    },
    {
      code: 'function f(opts: { a: string } & ({ b?: number } | null)) {}',
      errors: [{ message: option('b') }],
    },
    {
      code: 'function f(opts: { a?: string } = {}) {}',
      errors: [{ message: defaulted('opts') }, { message: option('a') }],
    },
    {
      code: 'interface Opts { a?: string }',
      errors: [{ message: option('a') }],
    },
    {
      code: 'type Opts = { a?: string };',
      errors: [{ message: option('a') }],
    },
    {
      code: '/** @internal */\nexport function f(a?: string) {}',
      errors: [{ message: optional('a') }],
    },
    {
      code: '/** @internal */\nexport const f = (opts: { a?: string }) => {};',
      errors: [{ message: option('a') }],
    },
    {
      code: '/** @internal */\nexport function f(a: string): void;\nexport function f(a?: number): void;\nexport function f(a?: unknown) {}',
      errors: [{ message: optional('a') }, { message: optional('a') }],
    },
    {
      code: '/** @internal */\nexport interface Opts { a?: string; nested: { b?: number } }',
      errors: [{ message: option('a') }, { message: option('b') }],
    },
    {
      code: '/** @internal */\nexport type Opts = { a?: string } & { b?: number };',
      errors: [{ message: option('a') }, { message: option('b') }],
    },
    {
      code: '/** @internal */\nexport class C {\n  p?: number;\n  constructor(a = 1) {}\n  m(b?: string) {}\n}',
      errors: [
        { message: option('p') },
        { message: defaulted('a') },
        { message: optional('b') },
      ],
    },
    {
      code: 'interface Worker { run(retries?: number): void }',
      errors: [{ message: optional('retries') }],
    },
    {
      code: 'interface Callable { (a?: number): void }',
      errors: [{ message: optional('a') }],
    },
    {
      code: 'type Callback = (retry?: number) => void;',
      errors: [{ message: optional('retry') }],
    },
    // `@internal` is internal even when an entry point exports it.
    {
      code: '/** @internal */\nexport function reached(a?: string) {}',
      filename: join(import.meta.dirname, 'fixtures/pkg/src/reached.ts'),
      errors: [{ message: optional('a') }],
    },
    {
      code: 'function run(opts: { retry?: number }[]) {}',
      errors: [{ message: option('retry') }],
    },
    {
      code: 'const run: (retry?: number) => void = () => {};',
      errors: [{ message: optional('retry') }],
    },
    // `(a, b)` returns `b`, so `a` isn't exposed.
    {
      code: 'class Scratch { retry?: number }\nexport function count() { return (new Scratch(), 0); }',
      errors: [{ message: option('retry') }],
    },
    // A type only an internal declaration uses is internal.
    {
      code: 'interface Opts { a?: string }\n/** @internal */\nexport function f(opts: Opts) {}',
      errors: [{ message: option('a') }],
    },
  ],
});
