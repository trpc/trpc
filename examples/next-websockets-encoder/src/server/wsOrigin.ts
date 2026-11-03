/**
 * Browsers don't apply CORS to WebSockets, so any page could open one to this
 * server. Only accept the app's own pages, which always send `Origin`.
 * Set `WS_ALLOWED_ORIGINS` (comma-separated) when deploying.
 */
const allowedOrigins = process.env.WS_ALLOWED_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? ['http://localhost:3000'];

export function isAllowedOrigin(origin: string | undefined) {
  return !!origin && allowedOrigins.includes(origin);
}
