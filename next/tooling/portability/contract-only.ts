/**
 * A contract package imports only `@trpc12/trpc/contract` and a schema
 * library, so it gets its own program (`tsconfig.contract.json`): with the
 * rest of the fixture, `@trpc12/trpc/server` would already be loaded.
 */
import { contract } from '@trpc12/trpc/contract';
import { z } from 'zod';

const c = contract.create().errors({ UNAUTHORIZED: {} });

export const billingContract = {
  invoices: c.output(z.array(z.object({ id: z.string() }))).query(),
  pay: c
    .input(z.object({ id: z.string() }))
    .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
    .mutation(),
};
