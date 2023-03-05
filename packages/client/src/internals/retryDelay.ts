/* istanbul ignore next -- @preserve */
export const retryDelay = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);
