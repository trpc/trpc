/**
 * @title Using the Predicate module
 */
import { Predicate } from "effect"

const thing: unknown = {
  a: 1
}

if (Predicate.isObject(thing)) {
  if (Predicate.isNumber(thing.a)) {
    console.log("number", thing.a)
  }
}
