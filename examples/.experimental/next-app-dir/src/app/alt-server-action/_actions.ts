'use server';

import { api, createAction } from '~/trpc/server-invoker';

export const createPostAction = createAction(api.createPost, {
  revalidates: ['/alt-server-action', api.getLatestPost],
});
