import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './packages/*',
  {
    // add "extends" to merge two configs together
    extends: './vitest.config.base.ts',
  },
]);
