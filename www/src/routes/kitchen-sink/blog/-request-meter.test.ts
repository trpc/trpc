import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { countEarlier, meter } from './-request-meter.ts';

describe('the request meter', () => {
  it('counts a result that came in the run before it watched, once', async () => {
    const aMoment = () => new Promise((resolve) => setTimeout(resolve, 5));
    const queryClient = new QueryClient();
    // Cached in an earlier visit
    queryClient.setQueryData([['blog', 'posts'], { type: 'infinite' }], {});
    await aMoment();
    meter.start();
    await aMoment();
    // Its loader's query finished before the meter mounted
    queryClient.setQueryData([['blog', 'postBySlug'], { type: 'query' }], {});

    countEarlier(queryClient.getQueryCache());
    // A second mount of the meter, as React's strict mode does
    countEarlier(queryClient.getQueryCache());

    expect(meter.get().arrivals.map((it) => it.path)).toEqual([
      'blog.postBySlug',
    ]);
  });
});
