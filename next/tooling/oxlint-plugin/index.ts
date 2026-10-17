import { eslintCompatPlugin } from '@oxlint/plugins';

import { acronymCase } from './acronym-case.ts';
import { jsdoc } from './jsdoc.ts';

const plugin = eslintCompatPlugin({
  meta: { name: 'trpc' },
  rules: {
    'acronym-case': acronymCase,
    jsdoc,
  },
});

export default plugin;
