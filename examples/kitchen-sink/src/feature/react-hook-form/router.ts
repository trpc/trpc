import * as trpc from '@trpc/server';
import { validationSchema } from 'pages/react-hook-form';

const items = [
  {
    id: '1',
    title: 'Hello tRPC',
    text: 'Hello world',
  },
];

export const reactHookFormRouter = trpc
  .router()
  .query('reactHookForm.list', {
    async resolve() {
      return items;
    },
  })
  .mutation('reactHookForm.add', {
    input: validationSchema,
    async resolve({ input }) {
      const id = Math.random()
        .toString(36)
        .replace(/[^a-z]+/g, '')
        .substr(0, 6);
      const item = {
        id,
        ...input,
      };
      items.push(item);

      return item;
    },
  });
