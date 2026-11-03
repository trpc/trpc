import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('explicit-batch-size', plugin.rules['explicit-batch-size']!, {
  valid: [
    `createFetchHandler({ router });`,
    `createFetchHandler({ router, batch: false });`,
    `createFetchHandler({ router, batch: { maxItems: 100 } });`,
    `httpLink({ url, batch: { maxItems } });`,
    `httpLink({ url, batch: { ...size } });`,
    `httpLink({ url, batch: size });`,
    `createV11Handler({ router, batch: false });`,
    `createV11Handler({ router, batch: { maxItems: 100 } });`,
    `createV11Handler({ router, ...options });`,
    `createV11Handler(options);`,
    `other({ batch: true });`,
    `client.post.list.query(undefined, { batch: false });`,
  ],
  invalid: [
    {
      code: `createFetchHandler({ router, batch: true });`,
      errors: [{ messageId: 'noSize' }],
    },
    {
      code: `httpLink({ url, batch: true });`,
      errors: [{ messageId: 'noSize' }],
    },
    {
      code: `httpLink({ url, batch: {} });`,
      errors: [{ messageId: 'noSize' }],
    },
    {
      code: `createV11Handler({ router, batch: true });`,
      errors: [{ messageId: 'noSize' }],
    },
    {
      code: `createV11Handler({ router, createContext });`,
      errors: [{ messageId: 'noBatch' }],
    },
  ],
});
