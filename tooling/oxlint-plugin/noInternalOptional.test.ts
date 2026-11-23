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
    // Types can be public through an exported type.
    'interface Opts { a?: string }',
    'type Opts = { a?: string };',
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
      code: 'function f(opts: { a?: string } = {}) {}',
      errors: [{ message: defaulted('opts') }, { message: option('a') }],
    },
  ],
});
