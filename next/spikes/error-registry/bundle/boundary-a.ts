/** Option A's boundaries, by code, over the app with no registry. */
import { createCodeErrorBoundary } from '../boundaries/codes.ts';
import { errorsOf } from '../boundaries/sources.ts';
import type { AppRouter } from './plain-app.ts';

export const [RootBoundary] = createCodeErrorBoundary({
  name: 'Root',
  errors: errorsOf<AppRouter>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error.code,
});

export const [AuthBoundary, useAuthBoundary] = createCodeErrorBoundary({
  name: 'Auth',
  errors: errorsOf<AppRouter['post']>(),
  parent: RootBoundary,
  claims: ['UNAUTHORIZED', 'NETWORK_ERROR'],
  fallback: (props) => props.error.message,
});
