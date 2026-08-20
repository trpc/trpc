import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    name: 'www',
  },
});
