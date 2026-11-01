/**
 * Enterprise Framework - http-cache-headers
 */
export function makeEtag(body: string): string {
  return `W/"${body.length}"`;
}
