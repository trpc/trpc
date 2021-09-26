/* istanbul ignore file */

export function assertNotBrowser() {
  if (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.JEST_WORKER_ID === undefined
  ) {
    throw new Error('Imported server-only code in the browser');
  }
}
