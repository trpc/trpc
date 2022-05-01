/**
 * Welcome to Cloudflare Workers!
 *
 * - Run `yarn dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from './server';

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '',
      req: request,
      router: appRouter,
      createContext,
    });
  },
};
