'use server';

import { api, createAction } from '~/trpc/server';

export const createPostAction = createAction(api.createPost);
