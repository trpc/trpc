import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// JSON drops a property set to `undefined`, so these may arrive without `nickname`
type UserWithUndefinedNickname = {
  id: string;
  nickname: string | undefined;
};
type UserWithOptionalNickname = {
  id: string;
  nickname?: string;
};

export const UndefinedPropertyRouter = t.router({
  userWithUndefinedNickname: t.procedure.query(
    (): UserWithUndefinedNickname => ({ id: '1', nickname: undefined }),
  ),
  userWithOptionalNickname: t.procedure.query((): UserWithOptionalNickname => ({
    id: '1',
  })),
});

export type UndefinedPropertyRouter = typeof UndefinedPropertyRouter;
