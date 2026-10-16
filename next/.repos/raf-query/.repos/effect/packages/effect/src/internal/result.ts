import * as Equal from "../Equal.ts"
import { format } from "../Formatter.ts"
import { dual } from "../Function.ts"
import * as Hash from "../Hash.ts"
import { toJson } from "../Inspectable.ts"
import type { Option } from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import type * as Result from "../Result.ts"
import { SingleShotGen } from "../Utils.ts"
import { PipeInspectableProto } from "./core.ts"
import * as option from "./option.ts"

const TypeId = "~effect/Result"

const CommonProto = {
  [TypeId]: {
    /* v8 ignore next 2 */
    _A: (_: never) => _,
    _E: (_: never) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this)
  }
}

const SuccessProto = Object.assign(Object.create(CommonProto), {
  _tag: "Success",
  _op: "Success",
  [Equal.symbol]<A, E>(this: Result.Success<A, E>, that: unknown): boolean {
    return (
      isResult(that) && isSuccess(that) && Equal.equals(this.success, that.success)
    )
  },
  [Hash.symbol]<A, E>(this: Result.Success<A, E>) {
    return Hash.combine(Hash.hash(this._tag))(Hash.hash(this.success))
  },
  toString<A, E>(this: Result.Success<A, E>) {
    return `success(${format(this.success)})`
  },
  toJSON<A, E>(this: Result.Success<A, E>) {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    }
  }
})

const FailureProto = Object.assign(Object.create(CommonProto), {
  _tag: "Failure",
  _op: "Failure",
  [Equal.symbol]<A, E>(this: Result.Failure<A, E>, that: unknown): boolean {
    return isResult(that) && isFailure(that) && Equal.equals(this.failure, that.failure)
  },
  [Hash.symbol]<A, E>(this: Result.Failure<A, E>) {
    return Hash.combine(Hash.hash(this._tag))(Hash.hash(this.failure))
  },
  toString<A, E>(this: Result.Failure<A, E>) {
    return `failure(${format(this.failure)})`
  },
  toJSON<A, E>(this: Result.Failure<A, E>) {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    }
  }
})

/** @internal */
export const isResult = (input: unknown): input is Result.Result<unknown, unknown> => hasProperty(input, TypeId)

/** @internal */
export const isFailure = <A, E>(result: Result.Result<A, E>): result is Result.Failure<A, E> =>
  result._tag === "Failure"

/** @internal */
export const isSuccess = <A, E>(result: Result.Result<A, E>): result is Result.Success<A, E> =>
  result._tag === "Success"

/** @internal */
const FailureImpl = function(this: any, failure: unknown) {
  this.failure = failure
} as unknown as { new<E>(failure: E): Result.Result<never, E>; prototype: any }
FailureImpl.prototype = FailureProto

/** @internal */
export const fail = <E>(failure: E): Result.Result<never, E> => new FailureImpl(failure)

/** @internal */
const SuccessImpl = function(this: any, success: unknown) {
  this.success = success
} as unknown as { new<A>(success: A): Result.Result<A>; prototype: any }
SuccessImpl.prototype = SuccessProto

/** @internal */
export const succeed = <A>(success: A): Result.Result<A> => new SuccessImpl(success)

/** @internal */
export const getFailure = <A, E>(self: Result.Result<A, E>): Option<E> =>
  isSuccess(self) ? option.none : option.some(self.failure)

/** @internal */
export const getSuccess = <A, E>(self: Result.Result<A, E>): Option<A> =>
  isFailure(self) ? option.none : option.some(self.success)

/** @internal */
export const fromOption: {
  <E>(onNone: () => E): <A>(self: Option<A>) => Result.Result<A, E>
  <A, E>(self: Option<A>, onNone: () => E): Result.Result<A, E>
} = dual(
  2,
  <A, E>(self: Option<A>, onNone: () => E): Result.Result<A, E> =>
    option.isNone(self) ? fail(onNone()) : succeed(self.value)
)
