/**
 * The billing domain's contract: schemas only, no server code, so a client
 * that only needs billing depends on this package and nothing else.
 */
import { contract } from '@trpc12/trpc/contract';
import { z } from 'zod';

export const Invoice = z.object({
  id: z.string(),
  cents: z.number().int(),
  paid: z.boolean(),
});

const c = contract.create().errors({ UNAUTHORIZED: {} });

export const billingContract = {
  invoices: c.output(z.array(Invoice)).query(),
  pay: c
    .input(z.object({ id: z.string() }))
    .output(Invoice)
    .errors({ NOT_FOUND: {} })
    .mutation(),
};

export type BillingContract = typeof billingContract;
