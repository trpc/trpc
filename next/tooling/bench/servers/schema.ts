import type { StandardSchemaV1 } from '@standard-schema/spec';

/** Passes input through, so the numbers are the framework's, not a validator's. */
export const schema = {
  '~standard': {
    vendor: 'bench',
    version: 1,
    validate: (value: unknown) => ({ value }),
  },
} as const satisfies StandardSchemaV1<unknown, unknown>;

export const port = Number(process.env['PORT'] ?? 3000);
