/** The backend's registries, one per module, and their merge. Server code. */
import { z } from 'zod';
import { createErrors, mergeErrors } from './merge-errors.ts';

// auth/errors.ts
export const authErrors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first.' },
  RateLimited: {
    status: 429,
    data: z.object({ retryAfter: z.number() }),
    retry: true,
  },
});

// posts/errors.ts
export const postErrors = createErrors({
  PostNotFound: {
    status: 404,
    data: z.object({ id: z.string() }),
    description: 'No post with this id.',
  },
  TitleTaken: {
    status: 409,
    data: z.object({ title: z.string() }),
    message: 'That title is taken',
  },
});

// billing/errors.ts
export const billingErrors = createErrors({
  CardDeclined: { status: 402, data: z.object({ reason: z.string() }) },
});

// errors.ts: the whole backend's, for OpenAPI and docs. Server code.
export const errors = mergeErrors(authErrors, postErrors, billingErrors);
