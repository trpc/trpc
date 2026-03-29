import type { TRPCError } from '../../@trpc/server';
import { getTRPCErrorFromUnknown } from '../../@trpc/server';
import { rethrowNextErrors } from './rethrowNextErrors';

type inferPromiseErrorShape<TPromise> = TPromise extends {
  readonly __errorShape?: infer TErrorShape;
}
  ? TErrorShape
  : never;

type inferDeclaredErrorFromShape<TShape> =
  Extract<
    TShape,
    {
      '~': {
        kind: 'declared';
        declaredErrorKey: string;
      };
    }
  > extends infer TDeclaredShape
    ? TDeclaredShape extends {
        data: infer TData extends object;
        message: infer TMessage extends string;
      }
      ? TRPCError &
          Omit<TData, 'message'> & {
            message: TMessage;
            toShape(): TDeclaredShape;
          }
      : never
    : never;

export async function safe<TPromise extends Promise<unknown>>(
  promise: TPromise,
): Promise<
  | [Awaited<TPromise>, null]
  | [
      undefined,
      TRPCError | inferDeclaredErrorFromShape<inferPromiseErrorShape<TPromise>>,
    ]
> {
  try {
    return [await promise, null];
  } catch (cause) {
    const error = getTRPCErrorFromUnknown(cause) as
      | TRPCError
      | inferDeclaredErrorFromShape<inferPromiseErrorShape<TPromise>>;

    rethrowNextErrors(error);

    return [
      undefined,
      error,
    ];
  }
}
