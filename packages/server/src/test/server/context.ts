/* eslint-disable @typescript-eslint/ban-types */
import { ZodError } from 'zod';
import { initTRPC } from '../../core';

export type User = {
  id: string;
  memberships: {
    organizationId: string;
  }[];
};
////////// app bootstrap & middlewares ////////
export type Context = {
  db?: {};
  user?: User;
};
export const trpc = initTRPC<Context>()({
  errorFormatter({ error, shape }) {
    if (error.cause instanceof ZodError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          type: 'zod' as const,
          errors: error.cause.errors,
        },
      };
    }
    return shape;
  },
});

export const procedure = trpc.procedure;

/**
 * Middleware that checks if the user is logged in.
 */
export const isAuthed = trpc.middleware((params) => {
  if (!params.ctx.user) {
    throw new Error('zup');
  }
  return params.next({
    ctx: {
      user: params.ctx.user,
    },
  });
});
