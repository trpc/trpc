import { createRouter } from '../createRouter';
import { prisma } from '../prisma';

export const postAll = createRouter().query('post.all', {
  async resolve() {
    /**
     * For pagination you can have a look at this docs site
     * @link https://trpc.io/docs/useInfiniteQuery
     */

    return prisma.post.findMany({
      // [...]
    });
  },
});
