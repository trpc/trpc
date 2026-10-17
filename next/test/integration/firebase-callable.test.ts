import { Schema } from 'effect';
import { call, error, initTrpc, isTrpcError } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

// Stand-ins with the shapes of `firebase-functions/v2/https`, so the recipe in docs/platforms.md runs as written.
type FunctionsErrorCode = 'invalid-argument' | 'unauthenticated' | 'not-found';
class HttpsError extends Error {
  readonly code: FunctionsErrorCode;
  readonly details: unknown;
  constructor(code: FunctionsErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
interface CallableRequest {
  data: unknown;
  auth?: { uid: string };
}
const onCall =
  <T>(run: (request: CallableRequest) => Promise<T>) =>
  (request: CallableRequest) =>
    run(request);

const t = initTrpc<{ ctx: { uid: string | null } }>();
const appRouter = {
  post: {
    create: t.procedure
      .input(Schema.Struct({ title: Schema.String }))
      .mutation((opts) =>
        opts.ctx.uid === null
          ? error({ code: 'UNAUTHORIZED' })
          : opts.input.title === 'boom'
            ? (() => {
                throw new Error('secret detail');
              })()
            : { title: opts.input.title, by: opts.ctx.uid },
      ),
  },
};

const firebaseCode: Record<string, FunctionsErrorCode> = {
  BAD_REQUEST: 'invalid-argument',
  UNAUTHORIZED: 'unauthenticated',
  NOT_FOUND: 'not-found',
};

const createPost = onCall(async (request) => {
  try {
    return await call(appRouter.post.create, request.data as never, {
      ctx: { uid: request.auth?.uid ?? null },
    });
  } catch (error) {
    const code = isTrpcError(error) ? firebaseCode[error.code] : undefined;
    if (!isTrpcError(error) || code === undefined) throw error;
    throw new HttpsError(code, error.message, error.data);
  }
});

test('a procedure serves a Firebase callable function', async () => {
  expect(
    await createPost({ data: { title: 'Hi' }, auth: { uid: 'u1' } }),
  ).toEqual({ title: 'Hi', by: 'u1' });

  await expect(createPost({ data: { title: 'Hi' } })).rejects.toMatchObject({
    constructor: HttpsError,
    code: 'unauthenticated',
  });
  await expect(
    createPost({ data: { title: 1 }, auth: { uid: 'u1' } }),
  ).rejects.toMatchObject({
    constructor: HttpsError,
    code: 'invalid-argument',
  });

  const unexpected = await createPost({
    data: { title: 'boom' },
    auth: { uid: 'u1' },
  }).catch((e: unknown) => e);
  expect(unexpected).not.toBeInstanceOf(HttpsError);
});
