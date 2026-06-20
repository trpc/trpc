export function isServer() {
  return typeof window === 'undefined';
}
