import { eslintCompatPlugin } from '@oxlint/plugins';

import { acronymCase } from './acronym-case.ts';
import { jsdoc } from './jsdoc.ts';
import { typedObjects } from './typed-objects.ts';

const plugin = eslintCompatPlugin({
  meta: { name: 'trpc' },
  rules: {
    'acronym-case': acronymCase,
    jsdoc,
    'typed-objects': typedObjects,
  },
});

export default plugin;
