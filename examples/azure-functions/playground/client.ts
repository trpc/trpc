import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import cfetch from 'cross-fetch';
import type { AppRouter } from '../TRPCExample';

// console.log("f:", fetch);

const client = createTRPCProxyClient<AppRouter>({
    links: [
        httpBatchLink({
            url: 'http://localhost:7071/api/trpc',
            fetch(url, options) {
                return cfetch(url, {
                    ...options
                })
            }
        }),
    ],
});

(async () => {
    try {
        const q = await client.greet.query({ name: 'Erik' });
        console.log(q);
    } catch (error) {
        console.log('error', error);
    }
})();