/**
 * @since 2.0.0
 */
import * as Equal from "../Equal.ts"
import { format } from "../Formatter.ts"
import * as Hash from "../Hash.ts"
import { toJson } from "../Inspectable.ts"
import type * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import { SingleShotGen } from "../Utils.ts"
import { PipeInspectableProto } from "./core.ts"

const TypeId = "~effect/Option"

const CommonProto = {
  [TypeId]: {
    _A: (_: never) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this)
  }
}

// `valueOrUndefined` is folded into the initializer (rather than a separate
// `Object.defineProperty(SomeProto, ...)` statement) so the whole definition
// is pure-annotated by the build and tree-shakable.
const SomeProto = Object.defineProperty(
  Object.assign(Object.create(CommonProto), {
    _tag: "Some",
    _op: "Some",
    [Equal.symbol]<A>(this: Option.Some<A>, that: unknown): boolean {
      return (
        isOption(that) && isSome(that) && Equal.equals(this.value, that.value)
      )
    },
    [Hash.symbol]<A>(this: Option.Some<A>) {
      return Hash.combine(Hash.hash(this._tag))(Hash.hash(this.value))
    },
    toString<A>(this: Option.Some<A>) {
      return `some(${format(this.value)})`
    },
    toJSON<A>(this: Option.Some<A>) {
      return {
        _id: "Option",
        _tag: this._tag,
        value: toJson(this.value)
      }
    }
  }),
  "valueOrUndefined",
  {
    get() {
      return this.value
    }
  }
)

const NoneHash = Hash.hash("None")
const NoneProto = Object.assign(Object.create(CommonProto), {
  _tag: "None",
  _op: "None",
  valueOrUndefined: undefined,
  [Equal.symbol]<A>(this: Option.None<A>, that: unknown): boolean {
    return isOption(that) && isNone(that)
  },
  [Hash.symbol]<A>(this: Option.None<A>) {
    return NoneHash
  },
  toString<A>(this: Option.None<A>) {
    return `none()`
  },
  toJSON<A>(this: Option.None<A>) {
    return {
      _id: "Option",
      _tag: this._tag
    }
  }
})

/** @internal */
export const isOption = (input: unknown): input is Option.Option<unknown> => hasProperty(input, TypeId)

/** @internal */
export const isNone = <A>(fa: Option.Option<A>): fa is Option.None<A> => fa._tag === "None"

/** @internal */
export const isSome = <A>(fa: Option.Option<A>): fa is Option.Some<A> => fa._tag === "Some"

/** @internal */
export const none: Option.Option<never> = Object.create(NoneProto)

/** @internal */
const SomeImpl = function(this: any, value: unknown) {
  this.value = value
} as unknown as { new<A>(value: A): Option.Option<A>; prototype: any }
SomeImpl.prototype = SomeProto

/** @internal */
export const some = <A>(value: A): Option.Option<A> => new SomeImpl(value)
