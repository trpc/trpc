import { z } from 'zod';
import { TRPCError } from '../../../TRPCError';
import { procedure, trpc } from '../context';

/**
 * A reusable combination of an input + middleware that can be reused.
 * Accepts a Zod-schema as a generic.
 */
function isPartofOrg<
  TSchema extends z.ZodObject<{ organizationId: z.ZodString }>,
>(schema: TSchema) {
  return procedure.input(schema).use((params) => {
    const { ctx, input } = params;
    const { user } = ctx;
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    if (
      !user.memberships.some(
        (membership) => membership.organizationId !== input.organizationId,
      )
    ) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return params.next({
      ctx: {
        user,
      },
    });
  });
}
// Router with some mixed procedures
export const orgRouter = trpc.router({
  mutations: {
    editOrg: procedure
      .concat(
        isPartofOrg(
          z.object({
            organizationId: z.string(),
            data: z
              .object({
                name: z.string(),
              })
              .partial(),
          }),
        ),
      )
      .resolve(({ input }) => {
        // - User is guaranteed to be part of the organization queried
        //-  `input` is of type:
        // {
        //   data: {
        //       name: string;
        //   };
        //   organizationId: string;
        // }
        // [.... logic]
        return {
          id: input.organizationId,
          ...input.data,
        };
      }),
  },
});
