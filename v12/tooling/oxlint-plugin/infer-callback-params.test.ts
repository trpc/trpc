import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
});

const removed = (code: string, output: string) => ({
  code,
  errors: [
    {
      messageId: 'infer',
      suggestions: [{ messageId: 'inferSuggestion', output }],
    },
  ],
});

tester.run('infer-callback-params', plugin.rules['infer-callback-params']!, {
  valid: [
    `items.map((item) => item.id);`,
    `const button = <Button onClick={(event) => event.preventDefault()} />;`,
    `useMutation({ mutationFn: async (value) => save(value) });`,
    `function parse(value: string) {
       return Number(value);
     }`,
    `const parse = (value: string) => Number(value);`,
    `const helpers = { parse: (value: string) => Number(value) };`,
  ],
  invalid: [
    removed(
      `items.map((item: Item) => item.id);`,
      `items.map((item) => item.id);`,
    ),
    removed(
      `const button = <Button onClick={(event: MouseEvent) => event.preventDefault()} />;`,
      `const button = <Button onClick={(event) => event.preventDefault()} />;`,
    ),
    removed(
      `useMutation({ mutationFn: async (value: Input) => save(value) });`,
      `useMutation({ mutationFn: async (value) => save(value) });`,
    ),
    removed(
      `router.use({ nested: { handler: function ({ request }: Ctx) { return request.url; } } });`,
      `router.use({ nested: { handler: function ({ request }) { return request.url; } } });`,
    ),
    removed(
      `run([(value: number = 1) => value]);`,
      `run([(value = 1) => value]);`,
    ),
    removed(
      `promise.catch((error: unknown) => report(error));`,
      `promise.catch((error) => report(error));`,
    ),
  ],
});
