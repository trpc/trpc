import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parserOptions: { lang: 'tsx', ecmaFeatures: { jsx: true } },
  },
});

const error = (name: string) => ({
  message: `\`${name}\` is only used once. Inline it where it is used.`,
});

tester.run('no-single-use-function', plugin.rules['no-single-use-function']!, {
  valid: [
    // used twice
    'function send() {} send(); setTimeout(send, 1000);',
    'const send = () => {}; send(); send();',
    // exported
    'export function useThing() {} useThing();',
    'export const useThing = () => {}; useThing();',
    // a component, rendered as JSX or passed as a value
    'function Row() { return null; } const el = <Row />;',
    'function Home() { return null; } createRoute({ component: Home });',
    // exported at the end of the file
    'function helper() {} export { helper };',
    // inlining would create a function per iteration
    'const toId = (x) => x.id; items.map((item) => toId(item));',
    'const log = (x) => console.log(x); for (const x of xs) log(x);',
    // never used is `no-unused-vars`'s job
    'function unused() {}',
    // a recursive function used once from outside still has two reads
    'function walk(n) { if (n) walk(n - 1); } walk(3);',
    // not a function
    'const value = 1; use(value);',
  ],
  invalid: [
    {
      code: 'function send() {} send();',
      errors: [error('send')],
    },
    {
      code: 'const onClick = () => {}; const el = <button onClick={onClick} />;',
      errors: [error('onClick')],
    },
    {
      code: 'const fetchAll = async function () {}; await fetchAll();',
      errors: [error('fetchAll')],
    },
    {
      // declared inside the loop body, so inlining doesn't change how often it's created
      code: 'for (const x of xs) { const log = () => console.log(x); log(); }',
      errors: [error('log')],
    },
    {
      code: 'function useThing() {} function Component() { useThing(); }',
      errors: [error('useThing')],
    },
  ],
});
