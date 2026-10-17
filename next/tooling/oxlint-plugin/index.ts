import { eslintCompatPlugin } from '@oxlint/plugins';

import { acronymCase } from './acronym-case.ts';
import { inferCallbackParams } from './infer-callback-params.ts';
import { jsdoc } from './jsdoc.ts';
import { noCustomTestTimeout } from './no-custom-test-timeout.ts';
import { noMock } from './no-mock.ts';
import { noOverzealousDestructuring } from './no-overzealous-destructuring.ts';
import { typedObjects } from './typed-objects.ts';

const plugin = eslintCompatPlugin({
  meta: { name: 'trpc' },
  rules: {
    'acronym-case': acronymCase,
    'infer-callback-params': inferCallbackParams,
    jsdoc,
    'no-custom-test-timeout': noCustomTestTimeout,
    'no-mock': noMock,
    'no-overzealous-destructuring': noOverzealousDestructuring,
    'typed-objects': typedObjects,
  },
});

export default plugin;
