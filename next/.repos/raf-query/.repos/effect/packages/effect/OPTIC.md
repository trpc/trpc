## Introduction

`effect/Optic` provides tools for building and composing functional optics.

Functional optics let you focus on parts of immutable data structures to read or update them in a safe, composable way.

Immutability keeps previous references valid after an update. This is useful in many domains, not only in concurrent programs.

## Mental model

Think of an optic as a reusable focus into a nested structure. It behaves like a pure, composable "getter + setter":

- **get** a focused value (or no value if the focus does not exist)
- **replace** the focused value
- **modify** the focused value with a function

You build small optics and compose them to reach deeper fields, optional data, or union variants.

## Glossary

- **Iso**: reversible focus between two types, like a lossless conversion.
- **Lens**: focus on a field that is always present.
- **Prism**: focus on one case of a union.
- **Optional**: focus that might or might not exist.
- **Traversal**: focus on zero or more items inside a collection.

## Features

- **Unified representation of optics.** All optics compose the same way because they share a single data type: `Optional`.
- **Integration.** Generate `Iso` values from schemas with `Schema.toIso`.

## Known Limitations

The `Optic` module only works with **plain JavaScript objects** and collections (structs, records, tuples, and arrays).

## Getting started

These are the three operations you will use most:

```ts
import { Optic } from "effect"

type S = { readonly a: number }
const _a = Optic.id<S>().key("a")

/**
 * Get the value of the focused field
 */
const value = _a.get({ a: 1 })
console.log(value) // 1

/**
 * Replace the value of the focused field
 */
const replaced = _a.replace(2, { a: 1 })
console.log(replaced) // { a: 2 }

/**
 * Modify the value of the focused field
 */
const modified = _a.modify((n) => n + 1)({ a: 1 })
console.log(modified) // { a: 2 }
```

### Nested data structures

Suppose we have an employee object, and we want to capitalize the first character of the street name of the company address.

**Example** (Uppercasing the first character of a street name)

```ts
import { Optic, String } from "effect"

// Define some nested data structures
interface Street {
  readonly num: number
  readonly name: string
}
interface Address {
  readonly city: string
  readonly street: Street
}
interface Company {
  readonly name: string
  readonly address: Address
}
interface Employee {
  readonly name: string
  readonly company: Company
}

// A sample employee object
const from: Employee = {
  name: "john",
  company: {
    name: "awesome inc",
    address: {
      city: "london",
      street: {
        num: 23,
        name: "high street"
      }
    }
  }
}

// Build an optic that drills down to the street name
const _streetName = Optic.id<Employee>()
  .key("company") // access "company"
  .key("address") // access "address"
  .key("street") // access "street"
  .key("name") // access "name"

// Modify the targeted value
const capitalizeStreetName = _streetName.modify(String.capitalize)

console.dir(capitalizeStreetName(from), { depth: null })
/*
{
  name: 'john',
  company: {
    name: 'awesome inc',
    address: {
      city: 'london',
      street: { num: 23, name: 'High street' }
    }
  }
}
*/
```

## Basic Usage

### Accessing a key in a struct or a tuple

**Example** (Reading and updating a single struct field)

```ts
import { Optic } from "effect"

type S = {
  readonly a: string
}

// Build an optic to access the "a" field
const _a = Optic.id<S>().key("a")

console.log(_a.replace("b", { a: "a" }))
// { a: 'b' }
```

**Example** (Reading and updating the first element of a tuple)

```ts
import { Optic } from "effect"

type S = readonly [string]

// Build an optic to access the first element
const _0 = Optic.id<S>().key(0)

console.log(_0.replace("b", ["a"]))
// ["b"]
```

### Choosing an optic quickly

| Data shape                        | Use                                  |
| --------------------------------- | ------------------------------------ |
| Always-present field              | `key`                                |
| Optional field (keep `undefined`) | `key`                                |
| Optional field (drop `undefined`) | `optionalKey`                        |
| Union case                        | `tag`                                |
| Record or array index             | `at`                                 |
| Filter and update items           | `forEach` + `check` / `notUndefined` |

### Accessing a group of keys in a struct

#### pick

**Example** (Updating multiple fields with `pick`)

```ts
import { Optic } from "effect"

type S = {
  readonly a: number
  readonly b: number
  readonly c: number
}

// Build an optic to access the "a" and "c" fields
const _a = Optic.id<S>().pick(["a", "c"])

console.log(_a.replace({ a: 4, c: 5 }, { a: 1, b: 2, c: 3 }))
// { a: 4, b: 2, c: 5 }
```

#### omit

**Example** (Updating all fields except a set with `omit`)

```ts
import { Optic } from "effect"

type S = {
  readonly a: number
  readonly b: number
  readonly c: number
}

// Build an optic to access the "a" and "c" fields
const _a = Optic.id<S>().omit(["b"])

console.log(_a.replace({ a: 4, c: 5 }, { a: 1, b: 2, c: 3 }))
// { a: 4, b: 2, c: 5 }
```

### Accessing an optional key in a struct or a tuple

There are two ways to handle an optional key in a struct or a tuple, depending on how you want to treat the `undefined` value:

1. when setting `undefined`, the key is preserved
2. when setting `undefined`, the key is removed

**Example** (Preserving the key when setting `undefined`)

```ts
import { Optic } from "effect"

type S = {
  readonly a?: number | undefined
}

// Lens<S, number | undefined>
const _a = Optic.id<S>().key("a")

console.log(String(_a.getResult({ a: 1 })))
// success(1)

console.log(String(_a.getResult({})))
// success(undefined)

console.log(String(_a.getResult({ a: undefined })))
// success(undefined)

console.log(_a.replace(2, { a: 1 }))
// { a: 2 }

console.log(_a.replace(2, {}))
// { a: 2 }

console.log(_a.replace(undefined, { a: 1 }))
// { a: undefined }

console.log(_a.replace(undefined, {}))
// { a: undefined }

console.log(_a.replace(2, { a: undefined }))
// { a: 2 }
```

**Example** (Removing the key when setting `undefined`)

```ts
import { Optic } from "effect"

type S = {
  readonly a?: number
}

// Lens<S, number | undefined>
const _a = Optic.id<S>().optionalKey("a")

console.log(String(_a.getResult({ a: 1 })))
// success(1)

console.log(String(_a.getResult({})))
// success(undefined)

console.log(_a.replace(2, { a: 1 }))
// { a: 2 }

console.log(_a.replace(2, {}))
// { a: 2 }

console.log(_a.replace(undefined, { a: 1 }))
// {}

console.log(_a.replace(undefined, {}))
// {}
```

**Example** (Dropping a tuple element when setting `undefined`)

```ts
import { Optic } from "effect"

type S = readonly [number, number?]

// Build an optic to access the optional second element
const _1 = Optic.id<S>().optionalKey(1)

console.log(_1.get([1, 2]))
// 2

console.log(_1.get([1]))
// undefined

console.log(_1.replace(3, [1, 2]))
// [1, 3]

console.log(_1.replace(undefined, [1, 2]))
// [1]
```

### Accessing a key in a record or an array

**Example** (Reading and updating a record entry)

```ts
import { Optic } from "effect"

type S = { [key: string]: number }

// Build an optic to access the value at key "a"
const _a = Optic.id<S>().at("a")

console.log(_a.replace(2, { a: 1 }))
// { a: 2 }
```

**Example** (Reading and updating an array element)

```ts
import { Optic } from "effect"

type S = ReadonlyArray<number>

// Build an optic to access the first element
const _0 = Optic.id<S>().at(0)

console.log(_0.replace(3, [1, 2]))
// [3, 2]
```

### Accessing a member in a tagged union

**Aside** (Convention for tagged unions)
The convention is to use `"_tag"` as the field that identifies the variant.

**Example** (Focusing a field inside one variant)

```ts
import { Optic } from "effect"

// A union of two tagged types
type S =
  | {
    readonly _tag: "A"
    readonly a: number
  }
  | {
    readonly _tag: "B"
    readonly b: number
  }

// Build an optic that focuses on the "a" field of the "A" variant
const _a = Optic.id<S>().tag("A").key("a")

console.log(_a.replace(2, { _tag: "A", a: 1 }))
// { _tag: 'A', a: 2 }

console.log(_a.replace(2, { _tag: "B", b: 1 })) // no match, so no change
// { _tag: 'B', b: 1 }
```

### Traversing a collection

**Example** (Incrementing only positive numbers in an array field)

```ts
import { Optic, Schema } from "effect"

type S = {
  readonly a: ReadonlyArray<number>
}

// Build an optic that focuses the field "a" and then
// narrows the focus to elements that pass the positivity check
const _positive = Optic.id<S>()
  .key("a") // focus the "a" array
  .forEach((item) => item.check(Schema.isGreaterThan(0))) // keep only positive elements

// Create a function that increments only the focused elements
const addOne = _positive.modifyAll((n) => n + 1)

console.log(addOne({ a: [1, -2, 3] }))
// { a: [ 2, -2, 4 ] }
```

**Technical detail**

Unlike many optic libraries, `Traversal` is not an optic on its own. It is modeled as an `Optional` whose focus is a `ReadonlyArray<A>`:

```ts
export interface Traversal<in out S, in out A> extends Optional<S, ReadonlyArray<A>> {}
```

To operate on each `A` inside a `Traversal<S, A>`, use `forEach`.
`forEach` takes a function whose argument is an `Iso<A, A>`, so you can keep drilling down by composing that `Iso` with other optics.

### Debugging focus failures

If a focus does not exist, `getResult` lets you see success vs failure explicitly:

```ts
import { Optic, Result } from "effect"

type S = { readonly a?: number }
const _a = Optic.id<S>().at("a")

const result = _a.getResult({})
const message = Result.match(result, {
  onSuccess: (value) => `value: ${value}`,
  onFailure: () => "no focus"
})

console.log(message) // no focus
```

## Generating an Optic from a Schema

**Example** (Generating an Optic from a Struct)

```ts
import { Schema } from "effect"

const schema = Schema.Struct({
  a: Schema.String,
  b: Schema.Number
})

/*
const _b: Lens<{
    readonly a: string;
    readonly b: number;
}, number>
*/
const _b = Schema.toIso(schema).key("b")

console.log(_b.replace(2, { a: "a", b: 1 }))
// { a: 'a', b: 2 }
```

You can also call `Schema.toIso` on custom types when their schema supplies `toCodecIso` or `toCodec` annotations. `Schema.Class` provides these, so class-based schemas work out of the box:

**Example** (Generating an Optic from a Class schema)

```ts
import { Schema } from "effect"

// Define a class schema
class Person extends Schema.Class<Person>("Person")({
  name: Schema.String,
  age: Schema.Number
}) {}

const _name = Schema.toIso(Person).key("name")

console.log(_name.replace("b", new Person({ name: "a", age: 1 })))
// Person { name: 'b', age: 1 }
```

## Why use functional optics when we already have Immer?

Immer is great: it lets you write "mutating" code that produces new immutable objects under the hood. For many teams that is enough. If you work with nested data, union types, and reusable update logic, **functional optics** (Iso, Lens, Prism, Optional, Traversal) cover use cases that Immer does not aim to address.

Below are the main differences, with small examples.

### Reusable focus instead of ad-hoc navigation

**Immer:** you repeat the path to the field each time you update it.

```ts
import { produce } from "immer"

type S = {
  readonly user: {
    readonly profile: {
      readonly name: string
    }
  }
}

declare const state: S

const upperName = produce(state, (draft) => {
  // Navigate to the field inline
  draft.user.profile.name = draft.user.profile.name.toUpperCase()
})

const lowerName = produce(state, (draft) => {
  // Repeat the same navigation again
  draft.user.profile.name = draft.user.profile.name.toLowerCase()
})
```

**Optics:** define a **Lens** once, then reuse it.

```ts
import { Optic } from "effect"

type S = {
  readonly user: {
    readonly profile: {
      readonly name: string
    }
  }
}

// Define a reusable Lens focusing the "name" field
// Lens<S, string>
const _name = Optic.id<S>().key("user").key("profile").key("name")

declare const state: S

// Apply different transformations without repeating the path
const upperName = _name.modify((name) => name.toUpperCase())(state)
const lowerName = _name.modify((name) => name.toLowerCase())(state)
```

Why this matters: if the path changes, you update it in one place. You also get small, testable building blocks that can be shared across modules instead of repeating object navigation.

### Declarative vs manual handling of optional data

**Immer:** manual checks for each optional field.

**Example** (Uppercasing titles with optional fields)

```ts
import { produce } from "immer"

type S = {
  readonly todos?: ReadonlyArray<{
    readonly title?: string
    readonly description: string
  }>
}

const state: S = {
  todos: [{ title: "milk", description: "buy milk" }, { description: "buy bread" }]
}

const next = produce(state, (draft) => {
  // Guard the optional array
  if (!draft.todos) return

  for (const item of draft.todos) {
    // Guard the optional field
    if (item.title !== undefined) {
      item.title = item.title.toUpperCase()
    }
  }
})

console.log(next)
/*
{
  todos: [
    { title: 'MILK', description: 'buy milk' },
    { description: 'buy bread' }
  ]
}
*/
```

**Optics:** declare the focus; types carry the safety.

**Example** (Uppercasing titles with declarative focus)

```ts
import { Optic } from "effect"

type S = {
  readonly todos?: ReadonlyArray<{
    readonly title?: string
    readonly description: string
  }>
}

const _title = Optic.id<S>()
  .key("todos")
  .notUndefined() // proceed only if 'todos' exists
  .forEach((item) => item.key("title").notUndefined()) // proceed only if 'title' exists

const state: S = {
  todos: [{ title: "milk", description: "buy milk" }, { description: "buy bread" }]
}

// Modify only the focused values (titles)
console.log(_title.modifyAll((title) => title.toUpperCase())(state))
/*
{
  todos: [
    { title: 'MILK', description: 'buy milk' },
    { description: 'buy bread' }
  ]
}
*/
```

### Composition over nesting

**Immer:** you often nest update blocks or repeat the same property paths.

**Optics:** compose small optics into larger ones. Composition keeps code flat and readable.

**Aside** (Reusing optics across modules)
Define an optic once (for example, a `User.address` lens) and import it wherever you need it. This avoids duplicating paths and centralizes changes when the data shape evolves.
