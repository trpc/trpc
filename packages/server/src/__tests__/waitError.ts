type Constructor<T extends object = object> = new (...args: any[]) => T;

export async function waitError<TError extends Error = Error>(
  /**
   * Function callback or promise that you expect will throw
   */
  fnOrPromise: Promise<unknown> | (() => unknown),
  /**
   * Force error constructor to be of specific type
   * @default Error
   **/
  errorConstructor?: Constructor<TError>,
): Promise<TError> {
  let res;
  try {
    if (typeof fnOrPromise === 'function') {
      res = await fnOrPromise();
    } else {
      res = await fnOrPromise;
    }
  } catch (cause) {
    // needs to be instanceof Error or DOMException
    if (
      cause instanceof Error === false &&
      cause instanceof DOMException === false
    ) {
      throw new Error(
        'Expected function to throw an error, but it threw something else',
      );
    }
    if (errorConstructor) {
      expect((cause as Error).name).toBe(errorConstructor.name);
    }
    return cause as TError;
  }

  // eslint-disable-next-line no-console
  console.warn('Expected function to throw, but it did not. Result:', res);
  throw new Error('Function did not throw');
}
