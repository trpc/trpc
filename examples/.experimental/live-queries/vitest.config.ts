import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      environment: 'node',
      // `event-source-polyfill` leaks an unhandled rejection when a stream is
      // aborted after its socket died; use Node's own EventSource instead.
      execArgv: ['--experimental-eventsource'],
      include: ['src/**/*.test.ts'],
    },
  }),
);
