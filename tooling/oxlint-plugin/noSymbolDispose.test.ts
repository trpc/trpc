import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('no-symbol-dispose', plugin.rules['no-symbol-dispose']!, {
  valid: [
    'const it = Symbol.asyncIterator;',
    'const resource = makeResource({}, () => {});',
    'const dispose = other.dispose;',
    'const s = MySymbol.dispose;',
  ],
  invalid: [
    {
      code: 'const d = Symbol.dispose;',
      errors: [
        {
          message:
            'Usage of Symbol.dispose is not allowed - use `makeResource()`',
        },
      ],
    },
    {
      code: 'const obj = { [Symbol.asyncDispose]: async () => {} };',
      errors: [
        {
          message:
            'Usage of Symbol.asyncDispose is not allowed - use `makeAsyncResource()`',
        },
      ],
    },
  ],
});
