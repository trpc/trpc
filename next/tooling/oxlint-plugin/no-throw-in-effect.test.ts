import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('no-throw-in-effect', plugin.rules['no-throw-in-effect']!, {
  valid: [
    `Effect.gen(function* () {
       return yield* new NotFound();
     });`,
    `Effect.try({
       try: () => {
         throw new Error('parse');
       },
       catch: (cause) => new ParseFailed({ cause }),
     });`,
    `Effect.tryPromise({
       try: async () => {
         throw new Error('fetch');
       },
       catch: (cause) => new FetchFailed({ cause }),
     });`,
    `async function* events() {
       throw new Error('a user-facing AsyncIterable rejects');
     }`,
    `function* plain() {
       throw new Error('not an Effect');
     }`,
    `Effect.gen(function* () {
       const parse = (s: string) => {
         if (s === '') throw new TypeError('helper throws, caller wraps it');
         return s;
       };
       return yield* Effect.try({ try: () => parse(''), catch: () => new Bad() });
     });`,
    `const router = mergeRouters(a, b, (key) => {
       throw new Error(key);
     });`,
    `Option.getOrElse(value, () => {
       throw new Error('not Effect or Stream');
     });`,
  ],
  invalid: [
    {
      code: `Effect.gen(function* () {
               throw new Error('typed failure lost');
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `Effect.gen(this, function* () {
               if (x) throw error({ code: 'NOT_FOUND' });
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `const f = Effect.fn('name')(function* () {
               throw new Error('boom');
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `const f = Effect.fnUntraced(function* () {
               throw new Error('boom');
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `Effect.sync(() => {
               throw new Error('defect');
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `effect.pipe(Effect.map((x) => {
               if (!x) throw new Error('defect');
               return x;
             }));`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `Effect.promise(async () => {
               throw new Error('a rejection is a defect too');
             });`,
      errors: [{ messageId: 'banned' }],
    },
    {
      code: `stream.pipe(Stream.mapEffect(function (x) {
               throw new Error('defect');
             }));`,
      errors: [{ messageId: 'banned' }],
    },
  ],
});
