---
title: Firebase
description: Call procedures from Firebase callable functions and map their errors to `HttpsError`.
section: Adapters
order: 9
experiment: adapters
---

A callable function gets JSON `data` and Firebase's `auth`, and reports errors as `HttpsError`. Call the procedure with `t.call()` and map the error code:

```ts
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from 'firebase-functions/v2/https';
import { isTrpcError } from '@trpc12/trpc/server';

const firebaseCode: Record<string, FunctionsErrorCode> = {
  BAD_REQUEST: 'invalid-argument',
  UNPROCESSABLE_CONTENT: 'invalid-argument',
  UNAUTHORIZED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  NOT_FOUND: 'not-found',
  CONFLICT: 'already-exists',
  PRECONDITION_FAILED: 'failed-precondition',
  TOO_MANY_REQUESTS: 'resource-exhausted',
  TIMEOUT: 'deadline-exceeded',
  CLIENT_CLOSED_REQUEST: 'cancelled',
  NOT_IMPLEMENTED: 'unimplemented',
  SERVICE_UNAVAILABLE: 'unavailable',
};

export const createPost = onCall(async (request) => {
  try {
    return await t.call(appRouter.post.create, request.data, {
      ctx: { uid: request.auth?.uid ?? null },
    });
  } catch (error) {
    const code = isTrpcError(error) ? firebaseCode[error.code] : undefined;
    // Anything else reaches the client as Firebase's masked `internal`.
    if (!isTrpcError(error) || code === undefined) throw error;
    throw new HttpsError(code, error.message, error.data);
  }
});
```

The input is validated by the procedure as usual. Firebase's wire format is plain JSON, so outputs lose `Date`s, `Map`s and the other types the tRPC [transformer](../server/transformers.md) keeps; return strings or numbers for those.

Firebase hosting can also serve `handler.fetch` through an HTTPS function (`onRequest`) behind Express ([Express](./node.md#express-fastify-and-nodehttp)), which keeps the whole protocol.
