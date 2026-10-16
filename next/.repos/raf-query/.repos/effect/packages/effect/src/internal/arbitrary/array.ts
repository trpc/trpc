import * as Effect from "../../Effect.ts"
import * as InternalArray from "../array.ts"
import { done } from "../core.ts"
import * as Model from "./model.ts"

/** @internal */
export interface Shape {
  readonly fixedCount: number
  readonly optionalCount: number
  readonly repeatCount: number
  readonly tailCount: number
  readonly minimum: number
}

function rebuild<A>(
  children: ReadonlyArray<Model.Retained<A>>,
  shape: Shape,
  elementStart = 0
): Model.Sample<Array<A>> {
  let index = 0
  let removable: number | undefined
  let itemShrinks: Model.ShrinkPull<Model.Retained<A> | Model.Discarded> | undefined
  let removableOptional = shape.repeatCount === 0 && shape.tailCount === 0
    ? Math.min(shape.optionalCount, children.length - shape.minimum)
    : 0
  const repeatEnd = shape.fixedCount + shape.repeatCount
  // Adapt fast-check v4.9.0's ArrayArbitrary (MIT): remove progressively smaller prefixes,
  // shrink the head, then visit the tail. The index loop avoids recursive slice traversal.
  // Unlike a suffix-local minimum, the whole-array minimum lets us remove interior elements
  // even when a retained prefix already accounts for part of the required length.
  // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/_internals/ArrayArbitrary.ts
  const loop = (): Model.ShrinkPull<Model.Attempt<Array<A>>> =>
    Effect.suspend(() => {
      if (removableOptional > 0) {
        const count = removableOptional
        removableOptional = Math.floor(removableOptional / 2)
        return Effect.succeed(rebuild(children.slice(0, -count), {
          ...shape,
          fixedCount: shape.fixedCount - count,
          optionalCount: shape.optionalCount - count
        }))
      }
      while (index < children.length) {
        removable ??= index >= shape.fixedCount && index < repeatEnd
          ? Math.min(repeatEnd - index, children.length - shape.minimum)
          : 0
        if (removable > 0) {
          const count = removable
          removable = Math.floor(removable / 2)
          return Effect.succeed(rebuild(children.slice(0, index).concat(children.slice(index + count)), {
            ...shape,
            repeatCount: shape.repeatCount - count
          }))
        }
        if (index >= elementStart) itemShrinks ??= children[index].shrinks?.()
        if (itemShrinks !== undefined) {
          return Effect.matchEffect(itemShrinks, {
            onFailure: () => {
              itemShrinks = undefined
              removable = undefined
              index++
              return loop()
            },
            onSuccess: (item): Effect.Effect<Model.Attempt<Array<A>>> => {
              if (item._tag === "Discarded") return Effect.succeed(item)
              return Effect.succeed(rebuild(InternalArray.replaceAt(children, index, item), shape, index))
            }
          })
        }
        index++
        removable = undefined
      }
      return done()
    })
  return Model.makeSample(children.map((child) => child.value), loop())
}

/** @internal */
export function sample<A>(
  children: ReadonlyArray<Model.Sample<A>>,
  shape: Shape,
  shrinks = true
): Model.Sample<Array<A>> {
  const value = children.map((child) => child.value)
  if (!shrinks) return Model.makeSample(value)
  if (children.length <= shape.minimum || shape.repeatCount === 0 && shape.optionalCount === 0) {
    return Model.productSample(children, (children) => children.map((child) => child.value))
  }
  return Model.makeSampleWithLazyShrinks(value, () => rebuild(children.map(Model.retain), shape).shrinks)
}
