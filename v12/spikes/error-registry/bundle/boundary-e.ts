/** Boundaries typed from E's posts subtree: the same bytes as every other option's. */
import { createErrorBoundary, errorsOf } from '../boundaries/boundaries.ts';
import type { AppRouter } from '../merge-errors/app.ts';

export const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<AppRouter['post']>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});

export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: errorsOf<AppRouter['post']>(),
  parent: RootBoundary,
  claims: ['Unauthorized', 'NetworkError'],
  fallback: (props) => props.error.message,
});
