import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const options = [{ roots: ['pkg/src/server'] }];
const at = (file: string) => `/repo/pkg/src/${file}`;

tester.run('module-boundaries', plugin.rules['module-boundaries']!, {
  valid: [
    {
      code: `import { validate } from './validation/index.ts';`,
      filename: at('server/caller.ts'),
      options,
    },
    {
      code: `import type { AnyRouter } from '../server/procedures/index.ts';
             export { isSchema } from '../server/validation/index.ts';`,
      filename: at('client/types.ts'),
      options,
    },
    // Inside a module, siblings import each other directly.
    {
      code: `import { isSchema } from './schema.ts';
             import { procedure } from './nested/procedure.ts';`,
      filename: at('server/validation/stream-schema.ts'),
      options,
    },
    // Loose files in the root aren't modules.
    {
      code: `import { createCaller } from '../caller.ts';
             import { server } from '../../server/index.ts';`,
      filename: at('server/procedures/router.ts'),
      options,
    },
    {
      code: `import { Effect } from 'effect';
             const lazy = () => import('./procedures/index.ts');`,
      filename: at('server/index.ts'),
      options,
    },
    // Folders named in `ignore` aren't modules.
    {
      code: `import type { WorkerRouter } from './fixtures/worker-server.ts';`,
      filename: at('server/message-port.test.ts'),
      options: [{ roots: ['pkg/src/server'], ignore: ['fixtures'] }],
    },
    // Outside every root, the rule has nothing to check.
    {
      code: `import { bracket } from '../openapi/bracket.ts';`,
      filename: at('actions/index.ts'),
      options,
    },
  ],
  invalid: [
    {
      code: `import type { WorkerRouter } from './fixtures/worker-server.ts';`,
      filename: at('server/message-port.test.ts'),
      options,
      errors: [{ message: /reaches into the fixtures module/ }],
    },
    {
      code: `import { validate } from './validation/schema.ts';`,
      filename: at('server/caller.ts'),
      options,
      errors: [
        {
          message:
            "'./validation/schema.ts' reaches into the validation module; import its index.ts instead.",
        },
      ],
    },
    {
      code: `import type { AnyRouter } from '../../server/procedures/router.ts';`,
      filename: at('client/links/local.ts'),
      options,
      errors: [{ message: /reaches into the procedures module/ }],
    },
    {
      code: `export { tracked } from '../subscriptions/tracked.ts';
             export * from '../subscriptions/publisher.ts';`,
      filename: at('server/procedures/builder.ts'),
      options,
      errors: [
        { message: /reaches into the subscriptions module/ },
        { message: /reaches into the subscriptions module/ },
      ],
    },
    {
      code: `const load = () => import('./procedures/router.ts');`,
      filename: at('server/index.ts'),
      options,
      errors: [{ message: /reaches into the procedures module/ }],
    },
    {
      code: `import { isSchema } from './index.ts';`,
      filename: at('server/validation/stream-schema.ts'),
      options,
      errors: [
        {
          message:
            "'./index.ts' is this file's own module's index.ts; import the file beside it instead.",
        },
      ],
    },
  ],
});
