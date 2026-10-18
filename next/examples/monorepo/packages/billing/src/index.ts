import { billingContract, type Invoice } from '@acme/billing-contract';
import { isAuthed, t } from '@acme/trpc';
import type { z } from 'zod';

const invoices = new Map<string, z.infer<typeof Invoice>>([
  ['inv_1', { id: 'inv_1', cents: 4200, paid: false }],
]);

const impl = t.implement(billingContract).use(isAuthed);

export const billingRouter = impl.router({
  invoices: impl.invoices.query(() => [...invoices.values()]),
  pay: impl.pay.mutation((opts) => {
    const invoice = invoices.get(opts.input.id);
    if (!invoice) return opts.errors.NOT_FOUND();
    invoice.paid = true;
    return invoice;
  }),
});

export type BillingRouter = typeof billingRouter;
