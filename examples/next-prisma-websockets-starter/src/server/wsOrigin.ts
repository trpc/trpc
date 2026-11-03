import { vercelHost } from '../utils/vercelHost';

/**
 * Browsers don't apply CORS to WebSockets, so any page could open one to this
 * server and send the user's cookies with it. Only accept the app's own pages,
 * which always send `Origin`.
 * Set `WS_ALLOWED_ORIGINS` (comma-separated) when deploying elsewhere.
 */
const allowedOrigins = process.env.WS_ALLOWED_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [
  vercelHost ? `https://${vercelHost}` : 'http://localhost:3000',
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

export function isAllowedOrigin(origin: string | undefined) {
  return !!origin && allowedOrigins.includes(origin);
}
