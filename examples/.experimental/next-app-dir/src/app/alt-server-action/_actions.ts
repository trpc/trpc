'use server';

import { api, createAction } from '~/trpc/server';

export const createPostAction = createAction(api.createPost, {
  revalidates: ['/alt-server-action', api.getPost],
});
