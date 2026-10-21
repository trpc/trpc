/**
 * B) `createErrors({ … })`: one object literal of every error the backend
 * can fail with, by tag. Server code only: resolvers return its entries
 * (`return errors.PostNotFound({ id })`), each procedure's union is what
 * its resolver and middleware return, and the client infers that from
 * `typeof appRouter`. `.errors(errors)` makes the registry a procedure's
 * contract, which it may then return only from.
 */
import type { ErrorSpec } from '../shared/define.ts';
import { fromSpecs } from '../shared/define.ts';

export const createErrors: <const M extends Record<string, ErrorSpec>>(
  specs: M,
) => ReturnType<typeof fromSpecs<M>> = fromSpecs;
