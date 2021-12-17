import fs from 'fs';
const SRC_DIR = __dirname + '/../src';
const PRISMA_FILE = __dirname + '/../prisma/schema.prisma';
const SERVER_DIR = __dirname + '/../src/server';
const ROUTER_DIR = SERVER_DIR + '/routers';
const HOOKS_DIR = __dirname + '/../src/hooks';

if (!fs.existsSync(ROUTER_DIR)) {
  fs.mkdirSync(ROUTER_DIR, { recursive: true });
}
if (!fs.existsSync(HOOKS_DIR)) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
}

function uppercaseFirst(str: string) {
  return str[0].toUpperCase() + str.substr(1);
}
const names = [
  //
  'animal',
  'backpack',
  'bag',
  'book',
  'bookcase',
  'bottle',
  'calendar',
  'cat',
  'content',
  'dog',
  'equipment',
  'flight',
  'horse',
  'list',
  'movie',
  'partner',
  'photo',
  'post',
  'seat',
  'setting',
  'shoe',
  'sweater',
  'thing',
  'trial',
  'trip',
  'user',
];

const NUM_ROUTERS = 50;

const prisma = [
  `
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}
`.trim(),
];
for (let index = 0; index < NUM_ROUTERS; index++) {
  const name = names[index] ?? `router${index}`;

  const uppercased = uppercaseFirst(name);
  prisma.push(
    `
model ${uppercased} {
  id    String @id @default(uuid())
  title String
  text  String

  createdAt DateTime @unique @default(now())
  updatedAt DateTime @unique @default(now())
}
`.trim(),
  );

  const router = `
import { createRouter } from 'server/createRouter';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
const router = createRouter()
  // create
  .mutation('add', {
    input: z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(32),
      text: z.string().min(1),
    }),
    async resolve({ ctx, input }) {
      const ${name} = await ctx.prisma.${name}.create({
        data: input,
      });
      return ${name};
    },
  })
  // read
  .query('all', {
    async resolve({ ctx }) {
      /**
       * For pagination you can have a look at this docs site
       * @link https://trpc.io/docs/useInfiniteQuery
       */

      return ctx.prisma.${name}.findMany({
        select: {
          id: true,
          title: true,
        },
      });
    },
  })
  .query('byId', {
    input: z.object({
      id: z.string(),
    }),
    async resolve({ ctx, input }) {
      const { id } = input;
      const ${name} = await ctx.prisma.${name}.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          text: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!${name}) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      return ${name};
    },
  })
  // update
  .mutation('edit', {
    input: z.object({
      id: z.string().uuid(),
      data: z.object({
        title: z.string().min(1).max(32).optional(),
        text: z.string().min(1).optional(),
      }),
    }),
    async resolve({ ctx, input }) {
      const { id, data } = input;
      const ${name} = await ctx.prisma.${name}.update({
        where: { id },
        data,
      });
      return ${name};
    },
  })
  // delete
  .mutation('delete', {
    input: z.string().uuid(),
    async resolve({ input: id, ctx }) {
      await ctx.prisma.${name}.delete({ where: { id } });
      return { id };
    },
  });

export const ${name}Router = createRouter().merge('${name}.', router);

export type ${uppercased}Router = typeof ${name}Router;
    `.trim();

  const utils = `
import { createReactQueryHooks } from '@trpc/react';    
import type { ${uppercased}Router } from 'server/routers/${name}';
const trpc = createReactQueryHooks<${uppercased}Router>();

export const use${uppercased}Query = trpc.useQuery;
export const use${uppercased}InfiniteQuery = trpc.useInfiniteQuery;
export const use${uppercased}Mutation = trpc.useMutation;
export const use${uppercased}Context = trpc.useContext;
    `.trim();
  fs.writeFileSync(SERVER_DIR + '/routers/' + name + '.ts', router);
  fs.writeFileSync(SRC_DIR + `/hooks/${name}.ts`, utils);
}

const appRouter = `
/**
 * This file contains the root router of your tRPC-backend
 */
import superjson from 'superjson';
import { createRouter } from '../createRouter';
${names.map((name) => `import { ${name}Router } from './${name}';`).join('\n')}

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouter = createRouter()
  /**
   * Add data transformers
   * @link https://trpc.io/docs/data-transformers
   */
  .transformer(superjson)
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ shape, error }) => { })
  ${names.map((name) => `.merge(${name}Router)`).join('\n  ')};

export type AppRouter = typeof appRouter;

console.log({
  queries: Object.keys(appRouter._def.queries).length,
  mutations: Object.keys(appRouter._def.mutations).length,
  subscriptions: Object.keys(appRouter._def.subscriptions).length,
});

`;

fs.writeFileSync(SERVER_DIR + '/routers/_app.ts', appRouter);
const prismaStr = prisma.join('\n\n');

fs.writeFileSync(PRISMA_FILE, prismaStr);
