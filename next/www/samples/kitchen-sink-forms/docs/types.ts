import type { ProfileInput, ProfileOutput } from '../src/schema.ts';

// #region types
export function shapes(values: ProfileInput, received: ProfileOutput) {
  // What the form holds and `mutate()` sends:
  const form = { ...values };
  //    ^?
  // What the procedure's resolver gets:
  const procedure = { ...received };
  //    ^?
  return { form, procedure };
}
// #endregion types
