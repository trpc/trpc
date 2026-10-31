import * as vm from 'node:vm';
import { initTRPC, TRPCError } from '@trpc/server';

/**
 * Errors created in another realm (node:vm, iframes, some bundler/APM
 * sandboxes) fail `instanceof Error`, so they end up wrapped in a synthetic
 * error. That wrapper must keep the original diagnostics, otherwise
 * `onError` only ever reports a stack starting at `getCauseFromUnknown`.
 */
function createCrossRealmError(): unknown {
  let caught: unknown;
  const context = vm.createContext({
    capture: (e: unknown) => {
      caught = e;
    },
  });
  vm.runInContext(
    `
    function loadAssignment() {
      return null.property;
    }
    try { loadAssignment() } catch (e) { capture(e) }
    `,
    context,
    { filename: 'assignment-service.js' },
  );
  return caught;
}

test('onError keeps the original stack and name of a cross-realm error', async () => {
  const original = createCrossRealmError();
  expect(original instanceof Error).toBe(false);

  const t = initTRPC.create();
  const router = t.router({
    getAssignment: t.procedure.query(() => {
      throw original;
    }),
  });

  const onError = vi.fn();
  const caller = t.createCallerFactory(router)({}, { onError });

  await expect(caller.getAssignment()).rejects.toThrow();

  expect(onError).toHaveBeenCalledTimes(1);
  const call = onError.mock.calls[0];
  assert(call);
  const { error } = call[0];
  assert(error instanceof TRPCError);

  expect(error.code).toBe('INTERNAL_SERVER_ERROR');
  expect(error.message).toBe(
    "Cannot read properties of null (reading 'property')",
  );

  const cause = error.cause;
  assert(cause);
  expect.soft(cause.name).toBe('TypeError');
  expect.soft(cause.stack).toContain('loadAssignment');
  expect.soft(cause.stack).toContain('assignment-service.js');
  expect.soft(error.stack).toContain('assignment-service.js');
});
