import * as Exit from "../../Exit.ts"
import * as Option from "../../Option.ts"
import { args } from "../core.ts"

/** @internal */
export const missing = Symbol()

/** @internal */
export { args }

/** @internal */
export type Success<A, E = never> = Exit.Success<A, E> & { readonly [args]: A }

/** @internal */
export const succeed = Exit.succeed as <A>(value: A) => Success<A>

/** @internal */
export const missingExit = succeed(missing)

// Shared success for a present input returned unchanged. It must be resolved
// before crossing an asynchronous or transformation boundary.
/** @internal */
export const sameExit: Success<unknown> = succeed(missing)

/** @internal */
export const toOption = <A>(value: A): Option.Option<A> => value === missing ? Option.none() : Option.some(value as A)

/** @internal */
export const fromOptionExit = <A>(option: Option.Option<A>): Success<A | typeof missing> =>
  option._tag === "None" ? missingExit : succeed(option.value)
