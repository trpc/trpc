import * as vm from 'node:vm';
import {
  getCauseFromUnknown,
  getTRPCErrorFromUnknown,
} from '@trpc/server/unstable-core-do-not-import';

describe('getCauseFromUnknown', () => {
  test('preserves non-enumerable string message from error-like object', () => {
    const crossRealmError = {};
    Object.defineProperty(crossRealmError, 'message', {
      value: 'something went wrong in the VM',
      enumerable: false,
      writable: true,
      configurable: true,
    });

    const cause = getCauseFromUnknown(crossRealmError);

    expect(cause).toBeInstanceOf(Error);
    expect(cause?.message).toBe('something went wrong in the VM');
  });

  test('handles cause object with non-string message property without throwing', () => {
    const causeWithNumericMessage = { message: 42, extra: 'data' };

    const cause = getCauseFromUnknown(causeWithNumericMessage);

    expect(cause).toBeInstanceOf(Error);
    expect((cause as typeof causeWithNumericMessage & Error).extra).toBe(
      'data',
    );
  });

  test('handles cause object with no message property', () => {
    const causeWithNoMessage = { code: 'ERR_SOMETHING', extra: 'data' };

    const cause = getCauseFromUnknown(causeWithNoMessage);

    expect(cause).toBeInstanceOf(Error);
    expect((cause as typeof causeWithNoMessage & Error).code).toBe(
      'ERR_SOMETHING',
    );
  });

  test('preserves message from actual Node VM cross-realm error', () => {
    let vmError: unknown;

    const context = vm.createContext({
      captureError: (e: unknown) => {
        vmError = e;
      },
    });
    vm.runInContext(
      'try { null.property } catch(e) { captureError(e) }',
      context,
    );

    expect(vmError).toBeDefined();
    expect(vmError instanceof Error).toBe(false);

    const trpcError = getTRPCErrorFromUnknown(vmError);

    expect(trpcError.message).not.toBe('');
    expect(trpcError.message).toBe(
      "Cannot read properties of null (reading 'property')",
    );
  });
});
