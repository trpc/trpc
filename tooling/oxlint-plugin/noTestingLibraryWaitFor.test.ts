import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const message =
  'Use `vi.waitFor` instead as the Testing Library one does not work with fake timers';

tester.run(
  'no-testing-library-wait-for',
  plugin.rules['no-testing-library-wait-for']!,
  {
    valid: [
      "import { render } from '@testing-library/react';",
      "import { waitFor } from './utils';",
      "import { screen } from '@testing-library/dom';",
      'await vi.waitFor(() => {});',
      "export { screen } from '@testing-library/dom';",
      "import * as utils from './utils';",
      "import '@testing-library/react';",
    ],
    invalid: [
      {
        code: "import { render, waitFor } from '@testing-library/react';",
        errors: [{ message }],
      },
      {
        code: "import { waitFor as wait } from '@testing-library/dom';",
        errors: [{ message }],
      },
      {
        code: "import * as testing from '@testing-library/react';",
        errors: [{ message }],
      },
      {
        code: "export { waitFor } from '@testing-library/dom';",
        errors: [{ message }],
      },
      {
        code: "export * from '@testing-library/react';",
        errors: [{ message }],
      },
    ],
  },
);
