import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('typed-objects', plugin.rules['typed-objects']!, {
  valid: [
    `fn({ something: y });`,
    `const x: Options = { something: y };
     fn(x);`,
    `const x = { something: y } satisfies Options;
     fn(x);
     fn(x);`,
    `const x = { something: y } as const;
     fn(x);`,
    `const x = {};
     fn(x);`,
    `export const x = { something: y };
     fn(x);`,
    `const x = { something: y };
     fn(x);
     export { x };`,
    `const x = { something: y };
     type X = typeof x;
     fn(x);`,
    `const x = { count: 0 };
     x.count = 1;
     fn(x);`,
    `const x = { count: 0 };
     x.count++;
     fn(x);`,
    `const x = { count: 0 };
     delete x.count;
     fn(x);`,
    `const x = { a: 1, b: 2 };
     fn(x.a, x.b);`,
    `const { a } = { a: 1 };
     fn(a);`,
    `const copy = { ...routes, ...extra };
     fn(copy);`,
    `const failure = { code: 'CLIENT_ERROR' };
     expect(error).toMatchObject(failure);
     await expect(promise).rejects.toMatchObject(failure);
     expect(failure).toBeDefined();`,
    `const body = { id: 1 };
     send(JSON.stringify(body), JSON.stringify(body));`,
    `const binary = { type: 'string' };
     expect(schema).toEqual({ file: binary, items: [binary] });`,
    `const entries = { server: () => import('./server') };
     test.each(Object.entries(entries))('%s', run);`,
    `const entry = { refs: 0 };
     if (map.get(key) === entry) map.delete(key);`,
    `const x = { something: y };`,
  ],
  invalid: [
    {
      code: `const x = { something: y };
             fn(x);`,
      errors: [{ messageId: 'inline', data: { name: 'x' } }],
    },
    {
      code: `const x = { something: y };
             fn(x);
             gn(x);`,
      errors: [{ messageId: 'typed', data: { name: 'x' } }],
    },
    {
      code: `const x = { a: 1 };
             fn(x.a, x);`,
      errors: [{ messageId: 'typed', data: { name: 'x' } }],
    },
    {
      code: `const line = { json: 0 };
             expect(decode(encode(line))).toEqual(line);`,
      errors: [{ messageId: 'typed', data: { name: 'line' } }],
    },
    {
      code: `const line = { json: 0 };
             expect(encode({ line })).toBe(1);`,
      errors: [{ messageId: 'inline', data: { name: 'line' } }],
    },
    {
      code: `const base = { path };
             fn({ ...base, input });`,
      errors: [{ messageId: 'inline', data: { name: 'base' } }],
    },
    {
      code: `const copy = { ...route, spec: undefined };
             fn(copy);`,
      errors: [{ messageId: 'inline', data: { name: 'copy' } }],
    },
    {
      code: `const options = { url };
             export default createClient(options);`,
      errors: [{ messageId: 'inline', data: { name: 'options' } }],
    },
    {
      code: `function make() {
               const x = { something: y };
               return x;
             }`,
      errors: [{ messageId: 'inline', data: { name: 'x' } }],
    },
  ],
});
