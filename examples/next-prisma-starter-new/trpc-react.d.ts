import '@trpc/server';
import type { Procedure as OriginalProcedure } from '@trpc/server';

declare module '@trpc/server' {
  export type Procedure<T> = OriginalProcedure<T> & {
    useQuery: void;
  };
}
