export function assertNotBrowser() {
  if (typeof window !== 'undefined') {
    throw new Error('Imported server-only code in the broowser');
  }
}
