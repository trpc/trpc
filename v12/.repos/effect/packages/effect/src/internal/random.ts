import * as Context from "../Context.ts"
import type { Random as RandomService } from "../Random.ts"

/** @internal */
export const Random: Context.Reference<RandomService> = Context.Reference<RandomService>("effect/Random", {
  defaultValue: () => ({
    nextIntUnsafe() {
      return Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - Number.MIN_SAFE_INTEGER + 1)) +
        Number.MIN_SAFE_INTEGER
    },
    nextDoubleUnsafe() {
      return Math.random()
    }
  })
})

/** @internal */
export const nextBetween = (min: number, max: number, draw: number): number => {
  const value = draw * (max - min) + min
  if (value !== max || min >= max || !Number.isFinite(max)) {
    return value
  }
  // Rounding can reach the excluded endpoint even for a draw below 1.
  // Return its immediate predecessor, which is at least min for finite min < max.
  if (max === 0) {
    return -Number.MIN_VALUE
  }
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, max)
  const bits = view.getBigUint64(0)
  view.setBigUint64(0, max > 0 ? bits - BigInt(1) : bits + BigInt(1))
  return view.getFloat64(0)
}
