/* eslint-disable no-console */
export const suppressLogs = () => {
  const log = console.log;
  const error = console.error;
  const noop = () => {
    // ignore
  };
  console.log = noop;
  console.error = noop;
  return () => {
    console.log = log;
    console.error = error;
  };
};

/**
 * Pause logging until the promise resolves or throws
 */
export const suppressLogsUntil = async (fn: () => Promise<void>) => {
  const release = suppressLogs();

  try {
    await fn();
  } finally {
    release();
  }
};
export const ignoreErrors = async (fn: () => unknown) => {
  /* eslint-enable no-console */
  const release = suppressLogs();
  try {
    await fn();
  } catch {
    // ignore
  } finally {
    release();
  }
};

export const doNotExecute = (_func: () => void) => true;
