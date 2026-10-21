/** Boundaries typed from F's `Errors` interface: the same bytes as every other option's. */
import { createErrorBoundary, errorsOf } from '../boundaries/boundaries.ts';
import type {} from '../register/app.ts';
import type { Errors } from '../register/register.ts';

export const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<Errors>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});

export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: errorsOf<Errors>(),
  parent: RootBoundary,
  claims: ['Unauthorized', 'NetworkError'],
  fallback: (props) => props.error.message,
});
