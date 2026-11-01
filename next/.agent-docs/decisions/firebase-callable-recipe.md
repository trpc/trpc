# Firebase callable functions are a recipe on `t.call()` (agent)

- (agent) For issue #6388 and the "later" adapters in `notes/open-issues-review.md`. No adapter: `onCall(async (request) => t.call(procedure, request.data, { ctx: from(request.auth) }))` plus a code map from tRPC error codes to Firebase's `FunctionsErrorCode`, in `www/docs/adapters/firebase.md`.
- (agent) The recipe throws `HttpsError` only for mapped codes. Unexpected errors are rethrown as they are, so Firebase masks them as `internal`, the same masking handlers do.
- (agent) An adapter would have to import `firebase-functions` (for `HttpsError`, which Firebase checks with `instanceof`) or take the class as an option, for about ten lines of glue. The callable protocol is plain JSON, so it can't carry the serializer's types either way.
- (agent) The test runs the recipe as written against stand-ins with the `onCall`/`HttpsError` shapes, rather than adding `firebase-functions` and `firebase-admin` to the test dependencies.
- Why: the old tRPC way would be an adapter package; the Effect-native core already has a direct-call API (`t.call()`), so the integration is the app's few lines.
- Lost: a typed `firebaseCallable(procedure)` one-liner. Apps that need the full protocol serve `handler.fetch` from an `onRequest` function.
- Lives in: `www/docs/adapters/firebase.md`, `test/integration/firebase-callable.test.ts`.
