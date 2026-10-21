/** Boundaries typed from the posts subtree of the app with no registry: the same bytes as every other option's. */
import { createErrorBoundary, errorsOf } from '../boundaries/boundaries.ts';
import type { AppRouter } from './plain-app.ts';

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
