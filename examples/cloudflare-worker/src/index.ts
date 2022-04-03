/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { resolveHTTPResponse } from '@trpc/server';

export default {
  async fetch(request: Request): Promise<Response> {
    resolveHTTPResponse({
      createContext: async () => ({}),
      path: request.url.lastIndexOf('/'),
    });
    return new Response('Hello World!');
  },
};
