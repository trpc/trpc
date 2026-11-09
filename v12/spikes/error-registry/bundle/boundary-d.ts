/** Boundaries typed from D's builder: the same bytes as every other option's. */
import { createErrorBoundary, errorsOf } from '../boundaries/boundaries.ts';
import type { errors } from '../builder/app.ts';

export const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<typeof errors>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});

export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: errorsOf<typeof errors>(),
  parent: RootBoundary,
  claims: ['Unauthorized', 'NetworkError'],
  fallback: (props) => props.error.message,
});
