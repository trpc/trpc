/**
 * Works with TypeScript `string` values.
 *
 * This module exposes common string operations in a pipe-friendly style. The
 * helpers cover checks, comparison, concatenation, trimming, casing, slicing,
 * padding, replacement, normalization, safe character access, search helpers
 * that return `Option`, and joining strings through a reducer.
 *
 * @since 2.0.0
 */

import type { NonEmptyArray } from "./Array.ts"
import * as Equ from "./Equivalence.ts"
import { dual } from "./Function.ts"
import * as readonlyArray from "./internal/array.ts"
import * as Count from "./internal/count.ts"
import * as number from "./Number.ts"
import * as Option from "./Option.ts"
import * as order from "./Order.ts"
import type * as Ordering from "./Ordering.ts"
import type { Refinement } from "./Predicate.ts"
import * as predicate from "./Predicate.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Exposes the global string constructor.
 *
 * **When to use**
 *
 * Use to access native JavaScript string coercion or constructor behavior from
 * the Effect module namespace.
 *
 * **Gotchas**
 *
 * Calling `String(value)` returns a primitive string. Calling
 * `new String(value)` creates a boxed `String` object.
 *
 * @see {@link isString} for checking whether a value is a primitive string
 *
 * @category constructors
 * @since 4.0.0
 */
export const String = globalThis.String

/**
 * Checks whether a value is a `string`.
 *
 * **Example** (Checking for strings)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.isString("a") // => true
 * String.isString(1) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isString: Refinement<unknown, string> = predicate.isString

/**
 * Provides an `Order` instance for comparing strings using lexicographic
 * ordering.
 *
 * **Example** (Comparing strings lexicographically)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.Order("apple", "banana") // => -1
 * String.Order("banana", "apple") // => 1
 * String.Order("apple", "apple") // => 0
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Order: order.Order<string> = order.String

/**
 * Provides an `Equivalence` instance for strings using strict equality (`===`).
 *
 * **Example** (Comparing strings for equality)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.Equivalence("hello", "hello") // => true
 * String.Equivalence("hello", "world") // => false
 * ```
 *
 * @category instances
 * @since 2.0.0
 */
export const Equivalence: Equ.Equivalence<string> = Equ.String

/**
 * Provides the empty string `""`.
 *
 * **When to use**
 *
 * Use when you need the canonical empty string value from the `String` module.
 *
 * **Example** (Referencing the empty string)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.empty // => ""
 * String.isEmpty(String.empty) // => true
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const empty: "" = "" as const

/**
 * Concatenates two strings at the type level.
 *
 * **Example** (Concatenating string literal types)
 *
 * ```ts import.meta.vitest
 * import type { String } from "effect"
 *
 * // Type-level concatenation
 * type Result = String.Concat<"hello", "world"> // "helloworld"
 *
 * const witness: Result = "helloworld"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type Concat<A extends string, B extends string> = `${A}${B}`

/**
 * Concatenates two strings at runtime.
 *
 * **Example** (Concatenating strings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * String.concat("hello", "world") // => "helloworld"
 * pipe("hello", String.concat("world")) // => "helloworld"
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const concat: {
  <B extends string>(that: B): <A extends string>(self: A) => Concat<A, B>
  <A extends string, B extends string>(self: A, that: B): Concat<A, B>
} = dual(2, (self: string, that: string): string => self + that)

/**
 * Converts a string to uppercase.
 *
 * **Example** (Converting strings to uppercase)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("a", String.toUpperCase) // => "A"
 * String.toUpperCase("hello") // => "HELLO"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const toUpperCase = <S extends string>(self: S): Uppercase<S> => self.toUpperCase() as Uppercase<S>

/**
 * Converts a string to lowercase.
 *
 * **Example** (Converting strings to lowercase)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("A", String.toLowerCase) // => "a"
 * String.toLowerCase("HELLO") // => "hello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const toLowerCase = <T extends string>(self: T): Lowercase<T> => self.toLowerCase() as Lowercase<T>

/**
 * Capitalizes the first character of a string.
 *
 * **Example** (Capitalizing a string)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("abc", String.capitalize) // => "Abc"
 * String.capitalize("hello") // => "Hello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const capitalize = <T extends string>(self: T): Capitalize<T> => {
  if (self.length === 0) return self as Capitalize<T>

  return (toUpperCase(self[0]) + self.slice(1)) as Capitalize<T>
}

/**
 * Uncapitalizes the first character of a string.
 *
 * **Example** (Uncapitalizing a string)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("ABC", String.uncapitalize) // => "aBC"
 * String.uncapitalize("Hello") // => "hello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const uncapitalize = <T extends string>(self: T): Uncapitalize<T> => {
  if (self.length === 0) return self as Uncapitalize<T>

  return (toLowerCase(self[0]) + self.slice(1)) as Uncapitalize<T>
}

/**
 * Replaces matches in a string using `String.prototype.replace`.
 *
 * **Details**
 *
 * String search values and non-global regular expressions replace the first
 * match; global regular expressions replace every match.
 *
 * **Example** (Replacing a substring)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("abc", String.replace("b", "d")) // => "adc"
 * pipe("hello world", String.replace("world", "Effect")) // => "hello Effect"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const replace = (searchValue: string | RegExp, replaceValue: string) => (self: string): string =>
  self.replace(searchValue, replaceValue)

/**
 * Type-level representation of trimming whitespace from both ends of a string.
 *
 * **Example** (Trimming whitespace at the type level)
 *
 * ```ts import.meta.vitest
 * import type { String } from "effect"
 *
 * type Result = String.Trim<"  hello  "> // "hello"
 *
 * const witness: Result = "hello"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type Trim<A extends string> = TrimEnd<TrimStart<A>>

/**
 * Removes whitespace from both ends of a string.
 *
 * **Example** (Trimming whitespace)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.trim(" a ") // => "a"
 * String.trim("  hello world  ") // => "hello world"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const trim = <A extends string>(self: A): Trim<A> => self.trim() as Trim<A>

/**
 * Type-level representation of trimming whitespace from the start of a string.
 *
 * **Example** (Trimming leading whitespace at the type level)
 *
 * ```ts import.meta.vitest
 * import type { String } from "effect"
 *
 * type Result = String.TrimStart<"  hello"> // "hello"
 *
 * const witness: Result = "hello"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type TrimStart<A extends string> = A extends `${" " | "\n" | "\t" | "\r"}${infer B}` ? TrimStart<B> : A

/**
 * Removes whitespace from the start of a string.
 *
 * **Example** (Trimming leading whitespace)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.trimStart(" a ") // => "a "
 * String.trimStart("  hello world") // => "hello world"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const trimStart = <A extends string>(self: A): TrimStart<A> => self.trimStart() as TrimStart<A>

/**
 * Type-level representation of trimming whitespace from the end of a string.
 *
 * **Example** (Trimming trailing whitespace at the type level)
 *
 * ```ts import.meta.vitest
 * import type { String } from "effect"
 *
 * type Result = String.TrimEnd<"hello  "> // "hello"
 *
 * const witness: Result = "hello"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type TrimEnd<A extends string> = A extends `${infer B}${" " | "\n" | "\t" | "\r"}` ? TrimEnd<B> : A

/**
 * Removes whitespace from the end of a string.
 *
 * **Example** (Trimming trailing whitespace)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.trimEnd(" a ") // => " a"
 * String.trimEnd("hello world  ") // => "hello world"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const trimEnd = <A extends string>(self: A): TrimEnd<A> => self.trimEnd() as TrimEnd<A>

/**
 * Extracts a section of a string and returns it as a new string.
 *
 * **Example** (Slicing strings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("abcd", String.slice(1, 3)) // => "bc"
 * pipe("hello world", String.slice(0, 5)) // => "hello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const slice = (start?: number, end?: number) => (self: string): string => self.slice(start, end)

/**
 * Checks whether a `string` is empty.
 *
 * **Example** (Checking for empty strings)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.isEmpty("") // => true
 * String.isEmpty("a") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isEmpty = (self: string): self is "" => self.length === 0

/**
 * Checks whether a `string` is non-empty.
 *
 * **Example** (Checking for non-empty strings)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.isNonEmpty("") // => false
 * String.isNonEmpty("a") // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isNonEmpty = (self: string): boolean => self.length > 0

/**
 * Returns the JavaScript string length, measured in UTF-16 code units.
 *
 * **Example** (Getting string length)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.length("abc") // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const length = (self: string): number => self.length

/**
 * Splits a string into an array of substrings using a separator.
 *
 * **Example** (Splitting strings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("abc", String.split("")) // => ["a", "b", "c"]
 * pipe("", String.split("")) // => [""]
 * String.split("hello,world", ",") // => ["hello", "world"]
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const split: {
  (separator: string | RegExp): (self: string) => NonEmptyArray<string>
  (self: string, separator: string | RegExp): NonEmptyArray<string>
} = dual(2, (self: string, separator: string | RegExp): NonEmptyArray<string> => {
  const out = self.split(separator)
  return readonlyArray.isArrayNonEmpty(out) ? out : [self]
})

/**
 * Returns `true` if `searchString` appears as a substring of `self`, at one or more positions that are
 * greater than or equal to `position`; otherwise, returns `false`.
 *
 * **Example** (Checking for substrings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("hello world", String.includes("world")) // => true
 * pipe("hello world", String.includes("foo")) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const includes = (searchString: string, position?: number) => (self: string): boolean =>
  self.includes(searchString, position)

/**
 * Returns `true` if the string starts with the specified search string.
 *
 * **Example** (Checking string prefixes)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("hello world", String.startsWith("hello")) // => true
 * pipe("hello world", String.startsWith("world")) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const startsWith = (searchString: string, position?: number) => (self: string): boolean =>
  self.startsWith(searchString, position)

/**
 * Returns `true` if the string ends with the specified search string.
 *
 * **Example** (Checking string suffixes)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("hello world", String.endsWith("world")) // => true
 * pipe("hello world", String.endsWith("hello")) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const endsWith = (searchString: string, position?: number) => (self: string): boolean =>
  self.endsWith(searchString, position)

/**
 * Returns the character code at the specified index safely, or `None` if the index is out of bounds.
 *
 * **Example** (Reading character codes)
 *
 * ```ts import.meta.vitest
 * import { Option, String } from "effect"
 *
 * String.charCodeAt("abc", 1) // => Option.some(98)
 * String.charCodeAt("abc", 4) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const charCodeAt: {
  (index: number): (self: string) => Option.Option<number>
  (self: string, index: number): Option.Option<number>
} = dual(
  2,
  (self: string, index: number): Option.Option<number> =>
    Option.filter(Option.some(self.charCodeAt(index)), (charCode) => !isNaN(charCode))
)

/**
 * Extracts characters from a string between two specified indices.
 *
 * **Example** (Extracting substrings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("abcd", String.substring(1)) // => "bcd"
 * pipe("abcd", String.substring(1, 3)) // => "bc"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const substring = (start: number, end?: number) => (self: string): string => self.substring(start, end)

/**
 * Returns the character at the specified relative index safely, or `None` if the index is out of bounds.
 *
 * **Example** (Accessing characters safely)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe("abc", String.at(1)) // => Option.some("b")
 * pipe("abc", String.at(4)) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const at: {
  (index: number): (self: string) => Option.Option<string>
  (self: string, index: number): Option.Option<string>
} = dual(2, (self: string, index: number): Option.Option<string> => Option.fromUndefinedOr(self.at(index)))

/**
 * Returns the character at the specified non-negative index safely, or `None` if the index is out of bounds.
 *
 * **Example** (Reading characters safely)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe("abc", String.charAt(1)) // => Option.some("b")
 * pipe("abc", String.charAt(4)) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const charAt: {
  (index: number): (self: string) => Option.Option<string>
  (self: string, index: number): Option.Option<string>
} = dual(
  2,
  (self: string, index: number): Option.Option<string> => Option.filter(Option.some(self.charAt(index)), isNonEmpty)
)

/**
 * Returns the Unicode code point at the specified index safely, or `None` if the index is out of bounds.
 *
 * **Example** (Reading code points)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe("abc", String.codePointAt(1)) // => Option.some(98)
 * pipe("abc", String.codePointAt(10)) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const codePointAt: {
  (index: number): (self: string) => Option.Option<number>
  (self: string, index: number): Option.Option<number>
} = dual(2, (self: string, index: number): Option.Option<number> => Option.fromUndefinedOr(self.codePointAt(index)))

/**
 * Returns the index of the first occurrence of a substring safely, or `None` if not found.
 *
 * **Example** (Finding the first substring index)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe("abbbc", String.indexOf("b")) // => Option.some(1)
 * pipe("abbbc", String.indexOf("z")) // => Option.none()
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const indexOf = (searchString: string) => (self: string): Option.Option<number> =>
  Option.filter(Option.some(self.indexOf(searchString)), number.isGreaterThanOrEqualTo(0))

/**
 * Returns the index of the last occurrence of a substring safely, or `None` if not found.
 *
 * **Example** (Finding the last substring index)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe("abbbc", String.lastIndexOf("b")) // => Option.some(3)
 * pipe("abbbc", String.lastIndexOf("d")) // => Option.none()
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const lastIndexOf = (searchString: string) => (self: string): Option.Option<number> =>
  Option.filter(Option.some(self.lastIndexOf(searchString)), number.isGreaterThanOrEqualTo(0))

/**
 * Computes locale-aware ordering for two strings, with optional locales and
 * collator options, and returns the result as an `Ordering` (`-1`, `0`, or
 * `1`).
 *
 * **Example** (Comparing strings by locale)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("a", String.localeCompare("b")) // => -1
 * pipe("b", String.localeCompare("a")) // => 1
 * pipe("a", String.localeCompare("a")) // => 0
 * ```
 *
 * @category comparisons
 * @since 2.0.0
 */
export const localeCompare =
  (that: string, locales?: Array<string>, options?: Intl.CollatorOptions) => (self: string): Ordering.Ordering =>
    number.sign(self.localeCompare(that, locales, options))

/**
 * Matches a string against a pattern safely and returns `Option.some` with the match
 * array, or `Option.none` when the pattern does not match.
 *
 * **Example** (Matching regular expressions)
 *
 * ```ts import.meta.vitest
 * import { Option, pipe, String } from "effect"
 *
 * pipe(
 *   "hello",
 *   String.match(/l+/),
 *   Option.map((match) => [match[0], match.index])
 * ) // => Option.some(["ll", 2])
 * pipe("hello", String.match(/x/)) // => Option.none()
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const match = (regExp: RegExp | string) => (self: string): Option.Option<RegExpMatchArray> =>
  Option.fromNullOr(self.match(regExp))

/**
 * Returns an iterator over all regular expression matches in the string using
 * native `String.prototype.matchAll` semantics.
 *
 * **Example** (Iterating regular expression matches)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * const matches = pipe("hello world", String.matchAll(/l/g))
 *
 * Array.from(matches, (match) => [match[0], match.index]) // => [["l", 2], ["l", 3], ["l", 9]]
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const matchAll = (regExp: RegExp) => (self: string): IterableIterator<RegExpMatchArray> => self.matchAll(regExp)

/**
 * Normalizes a string according to the specified Unicode normalization form.
 *
 * **Example** (Normalizing Unicode strings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * const str = "\u1E9B\u0323"
 * Array.from(pipe(str, String.normalize()), (character) => character.codePointAt(0)) // => [0x1e9b, 0x323]
 * Array.from(pipe(str, String.normalize("NFC")), (character) => character.codePointAt(0)) // => [0x1e9b, 0x323]
 * Array.from(
 *   pipe(str, String.normalize("NFD")),
 *   (character) => character.codePointAt(0)
 * ) // => [0x17f, 0x323, 0x307]
 * Array.from(pipe(str, String.normalize("NFKC")), (character) => character.codePointAt(0)) // => [0x1e69]
 * Array.from(
 *   pipe(str, String.normalize("NFKD")),
 *   (character) => character.codePointAt(0)
 * ) // => [0x73, 0x323, 0x307]
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const normalize = (form?: "NFC" | "NFD" | "NFKC" | "NFKD") => (self: string): string => self.normalize(form)

/**
 * Pads the string from the end with a given fill string to a specified length.
 *
 * **Example** (Padding strings at the end)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("a", String.padEnd(5)) // => "a    "
 * pipe("a", String.padEnd(5, "_")) // => "a____"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const padEnd = (maxLength: number, fillString?: string) => (self: string): string =>
  self.padEnd(maxLength, fillString)

/**
 * Pads the string from the start with a given fill string to a specified length.
 *
 * **Example** (Padding strings at the start)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("a", String.padStart(5)) // => "    a"
 * pipe("a", String.padStart(5, "_")) // => "____a"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const padStart = (maxLength: number, fillString?: string) => (self: string): string =>
  self.padStart(maxLength, fillString)

/**
 * Repeats the string the specified number of times.
 *
 * **Details**
 *
 * `count` is rounded down. `NaN` and non-positive values are treated as `0`.
 *
 * **Example** (Repeating strings)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("a", String.repeat(5)) // => "aaaaa"
 * pipe("hello", String.repeat(3)) // => "hellohellohello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const repeat = (count: number) => (self: string): string => self.repeat(Count.normalize(count))

/**
 * Replaces all occurrences of a substring or pattern in a string.
 *
 * **Example** (Replacing all matches)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * pipe("ababb", String.replaceAll("b", "c")) // => "acacc"
 * pipe("ababb", String.replaceAll(/ba/g, "cc")) // => "accbb"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const replaceAll = (searchValue: string | RegExp, replaceValue: string) => (self: string): string =>
  self.replaceAll(searchValue, replaceValue)

/**
 * Returns the index of the first match for a string or regular expression safely, or
 * `Option.none` when no match is found.
 *
 * **Example** (Searching strings)
 *
 * ```ts import.meta.vitest
 * import { Option, String } from "effect"
 *
 * String.search("ababb", "b") // => Option.some(1)
 * String.search("ababb", /abb/) // => Option.some(2)
 * String.search("ababb", "d") // => Option.none()
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const search: {
  (regExp: RegExp | string): (self: string) => Option.Option<number>
  (self: string, regExp: RegExp | string): Option.Option<number>
} = dual(
  2,
  (self: string, regExp: RegExp | string): Option.Option<number> =>
    Option.filter(Option.some(self.search(regExp)), number.isGreaterThanOrEqualTo(0))
)

/**
 * Converts the string to lowercase according to the specified locale.
 *
 * **Example** (Lowercasing strings by locale)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * const str = "\u0130"
 * pipe(str, String.toLocaleLowerCase("tr")) // => "i"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const toLocaleLowerCase = (locale?: string | Array<string>) => (self: string): string =>
  self.toLocaleLowerCase(locale)

/**
 * Converts the string to uppercase according to the specified locale.
 *
 * **Example** (Uppercasing strings by locale)
 *
 * ```ts import.meta.vitest
 * import { pipe, String } from "effect"
 *
 * const str = "i\u0307"
 * pipe(str, String.toLocaleUpperCase("lt-LT")) // => "I"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const toLocaleUpperCase = (locale?: string | Array<string>) => (self: string): string =>
  self.toLocaleUpperCase(locale)

/**
 * Keeps the specified number of characters from the start of a string.
 *
 * **Details**
 *
 * If `n` is larger than the available number of characters, the string will
 * be returned whole.
 *
 * If `n` is not a positive number, including `NaN`, an empty string will be
 * returned.
 *
 * If `n` is a float, it will be rounded down to the nearest integer.
 *
 * **Example** (Taking characters from the start)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.takeLeft("Hello World", 5) // => "Hello"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const takeLeft: {
  (n: number): (self: string) => string
  (self: string, n: number): string
} = dual(2, (self: string, n: number): string => self.slice(0, Count.normalize(n)))

/**
 * Keeps the specified number of characters from the end of a string.
 *
 * **Details**
 *
 * If `n` is larger than the available number of characters, the string will
 * be returned whole.
 *
 * If `n` is not a positive number, including `NaN`, an empty string will be
 * returned.
 *
 * If `n` is a float, it will be rounded down to the nearest integer.
 *
 * **Example** (Taking characters from the end)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.takeRight("Hello World", 5) // => "World"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const takeRight: {
  (n: number): (self: string) => string
  (self: string, n: number): string
} = dual(
  2,
  (self: string, n: number): string => self.slice(self.length - Math.min(Count.normalize(n), self.length), Infinity)
)

const CR = 0x0d
const LF = 0x0a

/**
 * Returns an `IterableIterator` which yields each line contained within the
 * string, trimming off the trailing newline character.
 *
 * **Example** (Iterating lines without separators)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * Array.from(String.linesIterator("hello\nworld\n")) // => ["hello", "world"]
 * ```
 *
 * @category splitting
 * @since 2.0.0
 */
export const linesIterator = (self: string): LinesIterator => linesSeparated(self, true)

/**
 * Returns an `IterableIterator` which yields each line contained within the
 * string as well as the trailing newline character.
 *
 * **Example** (Iterating lines with separators)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * Array.from(String.linesWithSeparators("hello\nworld\n")) // => ["hello\n", "world\n"]
 * ```
 *
 * @category splitting
 * @since 2.0.0
 */
export const linesWithSeparators = (s: string): LinesIterator => linesSeparated(s, false)

/**
 * Strips a leading margin prefix from every line using the supplied margin
 * character.
 *
 * **Example** (Stripping custom margins)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.stripMarginWith("  |hello\n  |world", "|") // => "hello\nworld"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const stripMarginWith: {
  (marginChar: string): (self: string) => string
  (self: string, marginChar: string): string
} = dual(2, (self: string, marginChar: string): string => {
  let out = ""

  for (const line of linesWithSeparators(self)) {
    let index = 0

    while (index < line.length && line.charAt(index) <= " ") {
      index = index + 1
    }

    const stripped = index < line.length && line.charAt(index) === marginChar
      ? line.substring(index + 1)
      : line

    out = out + stripped
  }

  return out
})

/**
 * Strips a leading `|` margin prefix from every line.
 *
 * **Example** (Stripping pipe margins)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.stripMargin("  |hello\n  |world") // => "hello\nworld"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const stripMargin = (self: string): string => stripMarginWith(self, "|")

/**
 * Converts a snake_case string to camelCase.
 *
 * **Example** (Converting snake_case to camelCase)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.snakeToCamel("hello_world") // => "helloWorld"
 * String.snakeToCamel("foo_bar_baz") // => "fooBarBaz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const snakeToCamel = (self: string): string => {
  if (self.length === 0) return self
  let str = self[0]
  for (let i = 1; i < self.length; i++) {
    str += self[i] === "_" ? self[++i].toUpperCase() : self[i]
  }
  return str
}

/**
 * Converts a snake_case string to PascalCase.
 *
 * **Example** (Converting snake_case to PascalCase)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.snakeToPascal("hello_world") // => "HelloWorld"
 * String.snakeToPascal("foo_bar_baz") // => "FooBarBaz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const snakeToPascal = (self: string): string => {
  if (self.length === 0) return self
  let str = self[0].toUpperCase()
  for (let i = 1; i < self.length; i++) {
    str += self[i] === "_" ? self[++i].toUpperCase() : self[i]
  }
  return str
}

/**
 * Converts a snake_case string to kebab-case.
 *
 * **Example** (Converting snake_case to kebab-case)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.snakeToKebab("hello_world") // => "hello-world"
 * String.snakeToKebab("foo_bar_baz") // => "foo-bar-baz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const snakeToKebab = (self: string): string => self.replace(/_/g, "-")

/**
 * Converts a camelCase string to snake_case.
 *
 * **Example** (Converting camelCase to snake_case)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.camelToSnake("helloWorld") // => "hello_world"
 * String.camelToSnake("fooBarBaz") // => "foo_bar_baz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const camelToSnake = (self: string): string => self.replace(/([A-Z])/g, "_$1").toLowerCase()

/**
 * Converts a PascalCase string to snake_case.
 *
 * **Example** (Converting PascalCase to snake_case)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.pascalToSnake("HelloWorld") // => "hello_world"
 * String.pascalToSnake("FooBarBaz") // => "foo_bar_baz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const pascalToSnake = (self: string): string =>
  (self.slice(0, 1) + self.slice(1).replace(/([A-Z])/g, "_$1")).toLowerCase()

/**
 * Converts a kebab-case string to snake_case.
 *
 * **Example** (Converting kebab-case to snake_case)
 *
 * ```ts import.meta.vitest
 * import { String } from "effect"
 *
 * String.kebabToSnake("hello-world") // => "hello_world"
 * String.kebabToSnake("foo-bar-baz") // => "foo_bar_baz"
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const kebabToSnake = (self: string): string => self.replace(/-/g, "_")

class LinesIterator implements IterableIterator<string> {
  private index: number
  private readonly length: number
  readonly s: string
  readonly stripped: boolean

  constructor(
    s: string,
    stripped: boolean = false
  ) {
    this.s = s
    this.stripped = stripped
    this.index = 0
    this.length = s.length
  }

  next(): IteratorResult<string> {
    if (this.done) {
      return { done: true, value: undefined }
    }
    const start = this.index
    while (!this.done && !isLineBreak(this.s[this.index]!)) {
      this.index = this.index + 1
    }
    let end = this.index
    if (!this.done) {
      const char = this.s[this.index]!
      this.index = this.index + 1
      if (!this.done && isLineBreak2(char, this.s[this.index]!)) {
        this.index = this.index + 1
      }
      if (!this.stripped) {
        end = this.index
      }
    }
    return { done: false, value: this.s.substring(start, end) }
  }

  [Symbol.iterator](): IterableIterator<string> {
    return new LinesIterator(this.s, this.stripped)
  }

  private get done(): boolean {
    return this.index >= this.length
  }
}

/**
 * Checks whether the provided character is a line break character (i.e. either `"\r"`
 * or `"\n"`).
 */
const isLineBreak = (char: string): boolean => {
  const code = char.charCodeAt(0)
  return code === CR || code === LF
}

/**
 * Checks whether the provided characters combine to form a carriage return/line-feed
 * (i.e. `"\r\n"`).
 */
const isLineBreak2 = (char0: string, char1: string): boolean => char0.charCodeAt(0) === CR && char1.charCodeAt(0) === LF

const linesSeparated = (self: string, stripped: boolean): LinesIterator => new LinesIterator(self, stripped)

/**
 * Normalizes a string by splitting it into word parts, transforming each part,
 * and joining the parts with a configurable delimiter.
 *
 * **When to use**
 *
 * Use when you need custom word-case output with a delimiter or part transform
 * that the fixed case helpers do not provide.
 *
 * @see {@link pascalCase} for fixed PascalCase output
 * @see {@link camelCase} for fixed lower-initial camelCase output
 * @see {@link constantCase} for fixed uppercase underscore-separated output
 * @see {@link kebabCase} for fixed lowercase hyphen-separated output
 * @see {@link snakeCase} for fixed lowercase underscore-separated output
 *
 * @category transforming
 * @since 4.0.0
 */
export const noCase: {
  (options?: {
    readonly splitRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
    readonly stripRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
    readonly delimiter?: string | undefined
    readonly transform?: (part: string, index: number, parts: ReadonlyArray<string>) => string
  }): (self: string) => string
  (self: string, options?: {
    readonly splitRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
    readonly stripRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
    readonly delimiter?: string | undefined
    readonly transform?: (part: string, index: number, parts: ReadonlyArray<string>) => string
  }): string
} = dual((args) => typeof args[0] === "string", (input: string, options?: {
  readonly splitRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
  readonly stripRegExp?: RegExp | ReadonlyArray<RegExp> | undefined
  readonly delimiter?: string | undefined
  readonly transform?: (part: string, index: number, parts: ReadonlyArray<string>) => string
}): string => {
  const splitRegExp = toRegExpArray(options?.splitRegExp ?? SPLIT_REGEXP)
  const stripRegExp = toRegExpArray(options?.stripRegExp ?? STRIP_REGEXP)
  const delimiter = options?.delimiter ?? " "
  const transform = options?.transform ?? toLowerCase
  return normalizeCase(input, splitRegExp, stripRegExp, delimiter, transform)
})

const toRegExpArray = (regexp: RegExp | ReadonlyArray<RegExp>): ReadonlyArray<RegExp> =>
  predicate.isRegExp(regexp) ? [regexp] : regexp

const normalizeCase = (
  input: string,
  splitRegExp: ReadonlyArray<RegExp>,
  stripRegExp: ReadonlyArray<RegExp>,
  delimiter: string,
  transform: (part: string, index: number, parts: ReadonlyArray<string>) => string
): string => {
  let result = input
  for (const regexp of splitRegExp) {
    result = result.replace(regexp, "$1\0$2")
  }
  for (const regexp of stripRegExp) {
    result = result.replace(regexp, "\0")
  }
  let start = 0
  let end = result.length
  // Trim the delimiter from around the output string.
  while (result.charAt(start) === "\0") {
    start++
  }
  while (result.charAt(end - 1) === "\0") {
    end--
  }

  // Transform each token independently.
  return result.slice(start, end).split("\0").map(transform).join(delimiter)
}

// Support camel case ("camelCase" -> "camel Case" and "CAMELCase" -> "CAMEL Case")
// and digit boundaries ("camel2case" -> "camel 2 case").
const SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g, /([A-Z])([0-9])/gi, /([0-9])([A-Z])/gi]

// Config paths preserve digit groups such as "v2" while still supporting camel case.
const CONFIG_SPLIT_REGEXP = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g]

// Remove all non-word characters.
const STRIP_REGEXP = /[^A-Z0-9]+/gi

const pascalCaseTransform = (input: string): string => {
  const firstChar = input.charAt(0)
  const lowerChars = input.substring(1).toLowerCase()
  return `${firstChar.toUpperCase()}${lowerChars}`
}

/**
 * Converts a string to PascalCase.
 *
 * **When to use**
 *
 * Use to normalize strings from spaces, separators, or camel/Pascal word
 * boundaries into PascalCase.
 *
 * @see {@link camelCase} for lower-initial camelCase output
 * @see {@link noCase} for configurable delimiters and part transforms
 * @see {@link snakeToPascal} for converting known snake_case input only
 *
 * @category transforming
 * @since 4.0.0
 */
export const pascalCase: (self: string) => string = noCase({
  delimiter: "",
  transform: pascalCaseTransform
})

const camelCaseTransform = (input: string, index: number): string =>
  index === 0
    ? input.toLowerCase()
    : pascalCaseTransform(input)

/**
 * Converts a string to camelCase.
 *
 * **When to use**
 *
 * Use to normalize mixed word separators or existing PascalCase/camelCase text
 * into lower-initial camelCase identifiers.
 *
 * @see {@link noCase} for configurable delimiters and part transforms
 * @see {@link pascalCase} for upper-initial PascalCase output
 * @see {@link snakeCase} for lowercase underscore-separated output
 * @see {@link kebabCase} for lowercase hyphen-separated output
 * @see {@link constantCase} for uppercase underscore-separated output
 *
 * @category transforming
 * @since 4.0.0
 */
export const camelCase: (self: string) => string = noCase({
  delimiter: "",
  transform: camelCaseTransform
})

/**
 * Converts a string to CONSTANT_CASE (uppercase with underscores).
 *
 * **When to use**
 *
 * Use to normalize words from mixed input formats into uppercase,
 * underscore-separated identifiers.
 *
 * @see {@link snakeCase} for lowercase underscore-separated output
 * @see {@link kebabCase} for lowercase hyphen-separated output
 * @see {@link camelCase} for lower-initial camelCase output
 * @see {@link pascalCase} for upper-initial PascalCase output
 * @see {@link configCase} for configuration key casing that preserves numeric word groups
 * @see {@link noCase} for configurable delimiters and part transforms
 *
 * @category transforming
 * @since 4.0.0
 */
export const constantCase: (self: string) => string = noCase({
  delimiter: "_",
  transform: toUpperCase
})

/**
 * Converts a string to CONFIG_CASE (uppercase with underscores) for
 * configuration keys.
 *
 * **When to use**
 *
 * Use to normalize configuration path segments into environment-variable-like
 * keys while preserving numeric word groups such as `v2`.
 *
 * **Details**
 *
 * Unlike {@link constantCase}, digit-letter boundaries are not split. For
 * example, `"api-v2 xml"` becomes `"API_V2_XML"`.
 *
 * @see {@link constantCase} for standard uppercase underscore-separated output
 * @category transforming
 * @since 4.0.0
 */
export const configCase: (self: string) => string = (self) =>
  normalizeCase(self, CONFIG_SPLIT_REGEXP, [STRIP_REGEXP], "_", toUpperCase)

/**
 * Converts a string to kebab-case (lowercase with hyphens).
 *
 * **When to use**
 *
 * Use to normalize free-form labels, identifiers, or keys into lowercase
 * hyphen-separated text.
 *
 * @see {@link noCase} for configurable delimiters and part transforms
 * @see {@link snakeCase} for lowercase underscore-separated output
 * @see {@link constantCase} for uppercase underscore-separated output
 * @see {@link camelCase} for lower-initial camelCase output
 * @see {@link pascalCase} for upper-initial PascalCase output
 *
 * @category transforming
 * @since 4.0.0
 */
export const kebabCase: (self: string) => string = noCase({
  delimiter: "-"
})

/**
 * Converts a string to snake_case (lowercase with underscores).
 *
 * **When to use**
 *
 * Use to normalize mixed-case or separator-delimited text into lowercase words
 * joined with underscores.
 *
 * @see {@link noCase} for configurable lower-level normalization
 * @see {@link kebabCase} for lowercase hyphen-separated output
 * @see {@link constantCase} for uppercase underscore-separated output
 *
 * @category transforming
 * @since 4.0.0
 */
export const snakeCase: (self: string) => string = noCase({
  delimiter: "_"
})

/**
 * Reducer for concatenating `string`s.
 *
 * **When to use**
 *
 * Use to concatenate many strings through APIs that consume a `Reducer`.
 *
 * **Details**
 *
 * The reducer starts from `""`, so combining an empty collection returns `""`.
 *
 * @see {@link concat} for concatenating two strings directly
 *
 * @category combining
 * @since 4.0.0
 */
export const ReducerConcat: Reducer.Reducer<string> = Reducer.make((a, b) => a + b, "")
