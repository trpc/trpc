/**
 * Controls how values appear in logs and debugging output.
 *
 * Effect data types use `Inspectable` to provide stable string, JSON, and
 * Node.js inspection output. This keeps custom values readable in logs, REPLs,
 * test failures, and diagnostics. This module defines the Node inspect symbol,
 * the `Inspectable` interface, safe conversion helpers, and shared prototype or
 * class implementations for custom values.
 *
 * @since 2.0.0
 */
import { format, formatJson } from "./Formatter.ts"
import * as Predicate from "./Predicate.ts"
import { redact } from "./Redactable.ts"

/**
 * Defines the symbol used by Node.js for custom object inspection.
 *
 * **When to use**
 *
 * Use to implement Node.js custom inspection for a value.
 *
 * **Details**
 *
 * This symbol is recognized by Node.js's `util.inspect()` function and the REPL
 * for custom object representation. When an object has a method with this symbol,
 * it will be called to determine how the object should be displayed.
 *
 * **Example** (Defining custom Node inspection)
 *
 * ```ts import.meta.vitest
 * import { Inspectable } from "effect"
 *
 * class CustomObject {
 *   constructor(private value: string) {}
 *
 *   [Inspectable.NodeInspectSymbol]() {
 *     return `CustomObject(${this.value})`
 *   }
 * }
 *
 * const obj = new CustomObject("hello")
 * obj[Inspectable.NodeInspectSymbol]() // => "CustomObject(hello)"
 * ```
 *
 * @category symbols
 * @since 2.0.0
 */
export const NodeInspectSymbol = Symbol.for("nodejs.util.inspect.custom")

/**
 * The type of the Node.js inspection symbol used for custom object inspection.
 * This symbol type is used to implement custom inspection behavior in Node.js
 * environments.
 *
 * **When to use**
 *
 * Use to type methods keyed by the Node.js custom inspection symbol.
 *
 * **Example** (Typing custom Node inspection)
 *
 * ```ts import.meta.vitest
 * import { Inspectable } from "effect"
 *
 * class CustomObject {
 *   constructor(private value: string) {}
 *
 *   [Inspectable.NodeInspectSymbol]() {
 *     return `CustomObject(${this.value})`
 *   }
 * }
 *
 * const obj = new CustomObject("test")
 * obj[Inspectable.NodeInspectSymbol]() // => "CustomObject(test)"
 * ```
 *
 * @category symbols
 * @since 2.0.0
 */
export type NodeInspectSymbol = typeof NodeInspectSymbol

/**
 * Interface for objects that can be inspected and provide custom string representations.
 *
 * **When to use**
 *
 * Use to define values with custom string, JSON, and Node.js inspection output.
 *
 * **Details**
 *
 * Objects implementing this interface can control how they appear in debugging contexts,
 * JSON serialization, and Node.js inspection. This is particularly useful for creating
 * custom data types that display meaningful information during development.
 *
 * **Example** (Implementing inspectable objects)
 *
 * ```ts import.meta.vitest
 * import { Formatter, Inspectable } from "effect"
 *
 * class Result implements Inspectable.Inspectable {
 *   constructor(
 *     private readonly tag: "Success" | "Failure",
 *     private readonly value: unknown
 *   ) {}
 *
 *   toString(): string {
 *     return Formatter.format(this.toJSON())
 *   }
 *
 *   toJSON() {
 *     return { _tag: this.tag, value: this.value }
 *   }
 *
 *   [Inspectable.NodeInspectSymbol]() {
 *     return this.toJSON()
 *   }
 * }
 *
 * const success = new Result("Success", 42)
 * success.toString() // => "{\"_tag\":\"Success\",\"value\":42}"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Inspectable {
  toString(): string
  toJSON(): unknown
  [NodeInspectSymbol](): unknown
}

/**
 * Converts a value to its structured inspection representation.
 *
 * **When to use**
 *
 * Use when you need the structured representation of an inspectable value
 * without risking unhandled errors.
 *
 * **Details**
 *
 * This function applies redaction before extracting data from objects that
 * implement `toJSON`, recursively processes arrays, and handles errors
 * gracefully. Plain objects are returned unchanged, so the result is not
 * guaranteed to be accepted by `JSON.stringify`; it may still contain values
 * such as `BigInt`, functions, or circular references.
 *
 * @see {@link toStringUnknown} for converting unknown values to strings
 *
 * @category converting
 * @since 4.0.0
 */
export const toJson = (input: unknown): unknown => {
  try {
    input = redact(input)
    if (
      Predicate.hasProperty(input, "toJSON") &&
      Predicate.isFunction(input["toJSON"]) &&
      input["toJSON"].length === 0
    ) {
      return input.toJSON()
    } else if (Array.isArray(input)) {
      return input.map(toJson)
    }
    return input
  } catch {
    return "[toJSON threw]"
  }
}

/**
 * Converts an unknown value to a string for diagnostics.
 *
 * **When to use**
 *
 * Use to produce a diagnostic string from a value whose runtime type is unknown.
 *
 * **Details**
 *
 * Strings are returned unchanged. Objects are formatted as JSON using the
 * provided whitespace setting when possible, and values that cannot be
 * formatted are converted with `String`.
 *
 * @category converting
 * @since 2.0.0
 */
export const toStringUnknown = (u: unknown, whitespace: number | string | undefined = 2): string => {
  if (typeof u === "string") {
    return u
  }
  try {
    return typeof u === "object" ? formatJson(u, { space: whitespace }) : format(u, { space: whitespace })
  } catch {
    return String(u)
  }
}

/**
 * A base prototype object that implements the {@link Inspectable} interface.
 *
 * **When to use**
 *
 * Use as a prototype for plain objects that should share standard inspectable behavior.
 *
 * **Details**
 *
 * This object provides default implementations for the {@link Inspectable} methods.
 * It can be used as a prototype for objects that want to be inspectable,
 * or as a mixin to add inspection capabilities to existing objects.
 *
 * **Example** (Using the base inspectable prototype)
 *
 * ```ts import.meta.vitest
 * import { Inspectable } from "effect"
 *
 * // Use as prototype
 * const myObject = Object.create(Inspectable.BaseProto)
 * myObject.name = "example"
 * myObject.value = 42
 *
 * myObject.toString() // => "\"[toJSON threw]\""
 *
 * // Or extend in a constructor
 * function MyClass(this: any, name: string) {
 *   this.name = name
 * }
 * MyClass.prototype = Object.create(Inspectable.BaseProto)
 * MyClass.prototype.constructor = MyClass
 * ```
 *
 * @category prototypes
 * @since 2.0.0
 */
export const BaseProto: Inspectable = {
  toJSON() {
    return toJson(this)
  },
  [NodeInspectSymbol]() {
    return this.toJSON()
  },
  toString() {
    return format(this.toJSON())
  }
}

/**
 * Provides an abstract base class that implements the Inspectable interface.
 *
 * **When to use**
 *
 * Use as a base class for inspectable objects that define their own JSON representation.
 *
 * **Details**
 *
 * This class provides a convenient way to create inspectable objects by extending it.
 * Subclasses only need to implement the `toJSON()` method, and they automatically
 * get proper `toString()` and Node.js inspection support.
 *
 * **Example** (Extending the inspectable base class)
 *
 * ```ts import.meta.vitest
 * import { Inspectable } from "effect"
 *
 * class User extends Inspectable.Class {
 *   constructor(
 *     public readonly id: number,
 *     public readonly name: string,
 *     public readonly email: string
 *   ) {
 *     super()
 *   }
 *
 *   toJSON() {
 *     return {
 *       _tag: "User",
 *       id: this.id,
 *       name: this.name,
 *       email: this.email
 *     }
 *   }
 * }
 *
 * const user = new User(1, "Alice", "alice@example.com")
 * user.toString() // => "{\"_tag\":\"User\",\"id\":1,\"name\":\"Alice\",\"email\":\"alice@example.com\"}"
 * user[Inspectable.NodeInspectSymbol]() // => { _tag: "User", id: 1, name: "Alice", email: "alice@example.com" }
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export abstract class Class {
  /**
   * Returns a JSON representation of this object.
   *
   * **When to use**
   *
   * Use to provide the JSON representation consumed by inherited inspection methods.
   *
   * **Details**
   *
   * Subclasses must implement this method to define how the object
   * should be serialized for debugging and inspection purposes.
   *
   * @since 2.0.0
   */
  abstract toJSON(): unknown
  /**
   * Node.js custom inspection method.
   *
   * **When to use**
   *
   * Use to expose the class JSON representation to Node.js inspection.
   *
   * @since 2.0.0
   */
  [NodeInspectSymbol]() {
    return this.toJSON()
  }
  /**
   * Returns a formatted string representation of this object.
   *
   * **When to use**
   *
   * Use to format the class JSON representation as a string.
   *
   * @since 2.0.0
   */
  toString() {
    return format(this.toJSON())
  }
}
