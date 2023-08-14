'use server';

import { api, createAction } from '~/trpc/server-invoker';

export const createPostAction = createAction(api.nested.createPost, {
  revalidates: [api.getLatestPost],
});
