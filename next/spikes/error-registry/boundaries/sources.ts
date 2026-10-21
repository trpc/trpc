/**
 * Where a boundary's error types come from. `errorsOf<T>()` is an empty
 * object, like v12's `routerType()`, whose type carries the server's
 * errors for `T`:
 *
 * - a router or a subrouter (`AppRouter`, `AppRouter['posts']`): every
 *   procedure's union, walked with v12's `inferRouterErrors`;
 * - a procedure (`AppRouter['posts']['byId']`): its union;
 * - a procedure builder (`typeof postProcedure`): its middleware's errors
 *   and what its `.errors()` declares, every option's declared form;
 * - a registry (B, E, F's `Errors`, an `.errors()` map of G's errors), D's
 *   builder, C's class list, or one of G's errors.
 *
 * A client imports the type and nothing else.
 */
import type {
  AnyProcedure,
  AnyProcedureBuilder,
  inferRouterErrors,
} from '@trpc12/trpc/server';
import type { AnyErrorMaker, ErrorsOf } from '../shared/define.ts';
import type { CallError, ClientErrorOf } from '../shared/failures.ts';
import type {
  AnyTaggedClass,
  Sent,
  TaggedRegistry,
} from '../tagged-classes/tagged-classes.ts';

type TypesOf<T> = T extends { readonly '~trpc': { readonly '~types'?: infer D } }
  ? NonNullable<D>
  : never;

/** The server's errors for `T`, before the client names them by tag. */
export type ServerErrorsOf<T> = T extends AnyProcedure | AnyProcedureBuilder
  ? TypesOf<T> extends { readonly errors: infer E }
    ? E
    : never
  : T extends TaggedRegistry<infer C extends AnyTaggedClass>
    ? Sent<C>
    : T extends { readonly add: unknown; readonly extend: unknown }
      ? ErrorsOf<Omit<T, 'add' | 'extend'>>
      : T extends AnyErrorMaker
        ? ReturnType<T>
        : [T[keyof T]] extends [AnyErrorMaker]
          ? ErrorsOf<T>
          : inferRouterErrors<T>;

/** A boundary's error types, as a value: an empty object at runtime. */
export interface ErrorSource<E> {
  readonly '~errors'?: E;
}

/** The error types of `T` (see the module's doc), for a boundary's `errors`. */
export const errorsOf = <T>(): ErrorSource<ServerErrorsOf<T>> => ({});

/** The app's errors for `T` as a client sees them, without tRPC's failures. */
export type ErrorsFrom<T> = ClientErrorOf<ServerErrorsOf<T>>;

/** Every tag a boundary over `T` may claim: the app's and tRPC's. */
export type TagOf<T> = CallError<ServerErrorsOf<T>>['_tag'];
