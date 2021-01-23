export function assertNotBrowser() {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('Imported server-only code in the broowser');
  }
}
