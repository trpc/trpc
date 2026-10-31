import { vercelHost } from './utils/vercelHost';

/**
 * @see https://nextjs.org/docs/app/guides/instrumentation
 */
export function register() {
  if (vercelHost) {
    // Must be set before `next-auth` is loaded, it reads this once
    process.env.NEXTAUTH_URL = `https://${vercelHost}/api/auth`;
  }
}
