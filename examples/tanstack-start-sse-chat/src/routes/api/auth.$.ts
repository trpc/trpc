import { createFileRoute } from '@tanstack/react-router';
import { handleAuthRequest } from '~/server/auth';

const handler = (opts: { request: Request }) => handleAuthRequest(opts.request);

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handler, POST: handler } },
});
