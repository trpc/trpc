# From Examples to Laws: Property-Based Testing with Effect's `Arbitrary`

Most unit tests choose a few inputs by hand and check the expected result for each one. Property-based testing asks the
computer to try many inputs for us.

Instead of listing every expected answer, we write a **property**: a rule that should be true for every allowed input.
If the rule fails, the test tries simpler versions of the failing input. This simplification step is called
**shrinking**, and the failing input reported to the user is called a **counterexample**.

Effect divides the work into three parts:

- `Schema` describes which inputs are allowed.
- `Arbitrary<A>` describes how to produce values of type `A` and how to simplify them after a failure. You can think of
  it as an input generator with built-in shrinking.
- `it.prop`, `it.effect.prop`, or `Arbitrary.checkEffect` runs the rule against generated inputs.

The API is available from `effect/Arbitrary` or as the `Arbitrary` export from `effect`. It is marked `@stability unstable`:
names, result types, generation policies, and replay format may still change before this module is promoted.

## Writing a First Property

Consider the rule “adding zero does not change an integer.” With `@effect/vitest`, we can write it directly:

```ts
import { it } from "@effect/vitest"
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const integer = Arbitrary.schema(Schema.Int)

it.prop("adding zero is identity", [integer], ([value]) => value + 0 === value)
```

`Arbitrary.schema` turns a Schema into a generator for the values represented by that Schema. `it.prop` tries the rule
100 times by default. It starts with small values, gradually tries more complex ones, and simplifies the first failing
input it finds.

Effect keeps the allowed inputs visible. Even a one-argument property receives its inputs from an array or record:

```ts
it.prop(
  "addition is commutative",
  { left: integer, right: integer },
  ({ left, right }) => left + right === right + left
)
```

That explicitness becomes useful as a test grows. Input names remain visible, and each input may come from either a
Schema or a pre-built `Arbitrary`.

## Choosing the Inputs

The rule and its allowed inputs belong together. A rule can be mathematically correct and still be unsuitable for the
values used by the program.

For example, JavaScript cannot represent integers of every size exactly. If we want to test ordinary integer arithmetic
without overflow or loss of precision, we should restrict the inputs accordingly:

```ts
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const SmallInt = Schema.Int.check(
  Schema.isBetween({ minimum: -100, maximum: 100 })
)

const smallInt = Arbitrary.schema(SmallInt)
```

For common checks, such as numeric bounds and collection lengths, Effect generates matching values directly instead of
generating unsuitable values and rejecting them afterward.

Use Schema to describe basic values and data structures. Then use the `Arbitrary` operations below when you need to
combine or transform those generated values.

## Looking at Generated Values

Sampling is useful while choosing your inputs. It is not a test by itself; it simply lets you see whether the generated
values have the shape and size you expected.

```ts
import { Effect } from "effect"

const examples = await Effect.runPromise(
  Arbitrary.sampleEffect(smallInt, {
    count: 10,
    size: 5,
    seed: "small-integers"
  })
)

console.log(examples)
```

The same generator, seed, size, and Effect version produce the same sequence. A fixed seed is therefore useful in
documentation and while investigating a problem. Ordinary tests usually do not need one: after a failure, Effect
returns a **replay token**, a string that can reproduce both the failing input and the simplification steps that
followed.

## Combining Generated Values

In the rest of this guide, “generator” means an `Arbitrary` value.

Use `Arbitrary.Constant` when a generator should always return an existing value. It is especially useful inside
`flatMap`, where one generated value chooses what should be generated next. A constant does not use randomness and
cannot be simplified further. If it contains an object, every run receives the same object, so the property must not
modify it.

Use:

- `map` to transform every generated value;
- `filter` to keep only values that pass a condition;
- `filterMap` to transform a value when the transformation may reject it.

```ts
import { Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const integers = Arbitrary.schema(Schema.Int)

const integerOrZero = Arbitrary.schema(Schema.Boolean).pipe(
  Arbitrary.flatMap((useFallback) => useFallback ? Arbitrary.Constant(0) : integers)
)

const nonNegativeLabels = integers.pipe(
  Arbitrary.filter((value) => value >= 0),
  Arbitrary.map((value) => `integer:${value}`)
)

const positiveLabels = Arbitrary.filterMap(
  integers,
  (value) => value > 0 ? Result.succeed(`positive:${value}`) : Result.fail(value)
)
```

These operations also apply while Effect simplifies a failing value. A value rejected by `filter` or `filterMap` is not
passed to the property. Effect limits how many generated values may be rejected, so an impossible condition stops with
`SampleError` or `Exhausted` instead of searching forever.

Prefer a Schema check when it can describe the allowed inputs directly. Effect can often generate matching values
immediately, whereas `filter` must first generate a value and then test it.

Use `all` to generate independent Arbitraries together. It accepts tuples, other iterables, and records while preserving
their shape:

```ts
const point = Arbitrary.all([
  Arbitrary.schema(Schema.Number),
  Arbitrary.schema(Schema.Number)
])

const person = Arbitrary.all({
  name: Arbitrary.schema(Schema.String),
  age: Arbitrary.schema(Schema.Int)
})
```

Effect may generate the members in a different internal order, but the returned tuple positions and record keys always
match the input. After a failure, it simplifies one member at a time. Empty tuples and records produce empty values.

Effect occasionally creates generated records without inherited `Object` methods. This can reveal code that assumes
methods such as `hasOwnProperty` always exist. Prefer `Object.hasOwn(value, key)` when checking generated objects.

Use `array` for variable-length collections of an existing Arbitrary:

```ts
const command = integers.pipe(Arbitrary.map((value) => ({ _tag: "Add" as const, value })))
const commands = Arbitrary.array(command, { maxLength: 50 })
```

`minLength` defaults to zero. Generation grows with `size`, honors explicit minima even at size zero, and respects
`maxLength`. Invalid bounds throw immediately. After a failure, `array` tries removing blocks, including prefixes and
interior blocks, while retaining the other elements in their original order. Retained objects keep their identity.
It also simplifies individual elements. The bounded search may stop before finding the smallest possible failure.

This differs from generating a length and using `flatMap` with `all`: shrinking that length regenerates the dependent
contents. Use `array` when shrinking should remove commands from the failing sequence. `Arbitrary.schema` applied to
`Schema.Array` uses the same block-removal strategy; prefer it when the complete collection is already a Schema.

Use `flatMap` when one generated value decides what can be generated next. Create the possible generators before the
callback when you can, because creating a Schema inside the callback repeats that work each time it runs:

```ts
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const Length = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 }))
)

const StringsByLength = globalThis.Array.from({ length: 4 }, (_, index) => {
  const length = index + 1
  return Arbitrary.schema(
    Schema.String.check(Schema.isMinLength(length), Schema.isMaxLength(length))
  )
})

const SizedString = Length.pipe(
  Arbitrary.flatMap((length) => StringsByLength[length - 1])
)
```

After a failure, Effect first tries simpler values from the first generator and rebuilds the dependent value. It then
tries simpler values from the selected dependent generator. This usually produces a small pair of related values
without breaking the relationship between them.

Callbacks passed to these operations must return normally, always produce the same result for the same input, finish
in a reasonable time, and avoid modifying generated values. Effect may call them again while simplifying or replaying
a failure. If a callback throws, `sampleEffect` or `checkEffect` reports a **defect**, Effect's term for an unexpected
failure.

### Targeting Rare Scenarios

Some behavior can only be tested with a particular combination or sequence of inputs. Making one value appear more
often does not guarantee that combination. For example, generating `Remove` more often still does not guarantee that
it follows an `Insert` for the same key.

Keep a general property over all command types, then add a focused property whose input already contains the
important transition:

```ts
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const Key = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 }))

const Insert = Schema.Struct({
  _tag: Schema.Literal("Insert"),
  value: Key
})

const Remove = Schema.Struct({
  _tag: Schema.Literal("Remove"),
  value: Key
})

const Contains = Schema.Struct({
  _tag: Schema.Literal("Contains"),
  value: Key
})

const Command = Schema.Union([Insert, Remove, Contains])

const arbitraryHistory = Arbitrary.schema(
  Schema.Array(Command).check(Schema.isMaxLength(50))
)

const RemoveExistingScenario = Schema.Struct({
  before: Schema.Array(Command).check(Schema.isMaxLength(20)),
  key: Key,
  after: Schema.Array(Command).check(Schema.isMaxLength(20))
})

const historyContainingRemoveExisting = Arbitrary.schema(RemoveExistingScenario).pipe(
  Arbitrary.map(({ before, key, after }) => [
    ...before,
    { _tag: "Insert" as const, value: key },
    { _tag: "Remove" as const, value: key },
    ...after
  ])
)
```

Use `arbitraryHistory` to explore interactions that were not anticipated. Use `historyContainingRemoveExisting` in a
separate property for behavior that specifically requires removing an existing key.

This is more reliable than a `frequency` operation, which would only make one choice more likely:

- every focused run contains the required sequence;
- requirements such as using the same key are visible in the generated input;
- `map` rebuilds the required `Insert` and `Remove` after each simplification, so the final counterexample still tests
  the intended behavior;
- the general property remains free to explore all command types.

If you need to reproduce production traffic proportions, measure throughput, or simulate a random process, use a
workload generator or simulation instead. Those tasks care about exact frequencies; a property test cares about
finding a small input that breaks a rule.

## Running a Property Directly

`it.prop` is the shortest way to use a property in a test. Use `Arbitrary.checkEffect` when your program needs to inspect
the result instead of immediately failing a Vitest test. It accepts a function that returns either a boolean or an
`Effect`, and it simplifies the first failing input:

```ts
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const values = Arbitrary.schema(Schema.Array(Schema.Int))

const program = Arbitrary.checkEffect(
  values,
  (input) => input.slice().reverse().reverse().every((value, index) => value === input[index]),
  { runs: 100, seed: "reverse" }
)

await Effect.runPromise(program)
// { _tag: "Passed", runs: 100, discards: 0 }
```

A property may also return an `Effect`, so it can use Effect services or fail through the Effect error channel:

```ts
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const program = Arbitrary.checkEffect(
  Arbitrary.schema(Schema.String),
  (value) => Effect.succeed(value.length >= 0)
)
```

A failed check is returned as a value. Read its `_tag` to see what happened:

| Result           | Meaning                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| `Passed`         | Every requested run passed.                                                            |
| `Falsified`      | The rule returned `false` or its Effect failed. Includes the simplified failing input. |
| `Exhausted`      | Too many generated values were rejected. Includes the seed needed to repeat the run.   |
| `ReplayMismatch` | A replay token no longer leads to the same kind of failure.                            |

When the returned Effect fails, `Falsified.failure` is a `PropertyError` containing its error value. Returning `false`
produces `ReturnedFalse`.

Effect keeps those two kinds of failure separate while simplifying an input. A proposed simpler input is not accepted
as the new counterexample if it changes from “returned false” to “Effect failed,” or the other way around. The actual
error value may change; only the kind of failure must stay the same.

Defects and Effect interruption continue through the Effect returned by `checkEffect` instead of becoming `CheckResult`
values. This allows timeouts and the Effect that started the check to interrupt it normally.

For the same input and environment, a property must always produce the same result. It must also treat generated values
as read-only. Effect may evaluate a value more than once while simplifying or replaying a failure, and it does not undo
changes made by the property.

## Turning Requirements into Properties

Many useful properties are equations. Requirements often contain words such as “same,” “independent of order,”
“reversible,” or “normalizes.” Each word suggests a rule that compares two or more executions of the same code. Such a
rule is often called a **law**.

### Changing Order or Grouping (Commutativity and Associativity)

```ts
import { it } from "@effect/vitest"
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 }))
)

it.prop(
  "addition is commutative",
  { a: smallInt, b: smallInt },
  ({ a, b }) => a + b === b + a
)

it.prop(
  "addition is associative",
  { a: smallInt, b: smallInt, c: smallInt },
  ({ a, b, c }) => (a + b) + c === a + (b + c)
)
```

The bounds are part of the meaning of these tests. They keep the generated values inside the region where JavaScript
integer arithmetic behaves like the algebra we intend to test.

### Running an Operation Twice Changes Nothing (Idempotence)

Normalization is commonly idempotent: once a value is normalized, applying the operation again should do nothing.

```ts
const clampNonNegative = (value: number): number => Math.max(0, value)

it.prop(
  "clamping is idempotent",
  [smallInt],
  ([value]) => clampNonNegative(clampNonNegative(value)) === clampNonNegative(value)
)
```

### Applying an Operation Twice Returns the Original (Involution)

An involution returns to the original value when applied twice. Negation is the smallest example:

```ts
it.prop(
  "negation is an involution",
  [smallInt],
  ([value]) => -(-value) === value
)
```

### Comparing Two Implementations

When replacing or optimizing an implementation, compare the two functions over the same generated inputs:

```ts
const doubleByAddition = (value: number): number => value + value
const doubleByMultiplication = (value: number): number => value * 2

it.prop(
  "the two double implementations agree",
  [smallInt],
  ([value]) => doubleByAddition(value) === doubleByMultiplication(value)
)
```

### Operations That Undo Each Other

```ts
const increment = (value: number): number => value + 1
const decrement = (value: number): number => value - 1

it.prop(
  "increment and decrement are inverses",
  [smallInt],
  ([value]) => decrement(increment(value)) === value
)
```

The `Arbitrary` module does not provide a separate helper for each kind of law. These comparisons are short to write
directly in TypeScript. A project that applies the same laws to many data types can still define its own reusable test
functions.

## Required Inputs and Common Traps

Each property should be able to fail, be easy to explain, and come from a real requirement. Adding more conditions
without clarifying the allowed inputs often makes a test harder to understand rather than more useful.

### Operations That Reject Some Inputs

If an operation only accepts some inputs, describe that restriction in the Schema when possible. For division, a union
can generate non-zero integers directly:

```ts
const NonZeroSmallInt = Schema.Union([
  Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: -1 })),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
])

const nonZeroSmallInt = Arbitrary.schema(NonZeroSmallInt)

it.prop("a non-zero integer divided by itself is one", [nonZeroSmallInt], ([value]) => value / value === 1)
```

Use `Arbitrary.filter` when Schema cannot express the condition:

```ts
const odd = smallInt.pipe(
  Arbitrary.filter((value) => value % 2 !== 0)
)
```

Rejected generated values count against `maxDiscards`. If very few values pass the filter, the check may return
`Exhausted` before running the property enough times. Prefer a Schema check or `flatMap` when either can generate valid
values directly.

### Floating-Point Laws

Floating-point arithmetic needs a different rule. Use `Schema.Finite` when `NaN` and infinities are outside the allowed
inputs. When exact equality is not the real requirement, compare results with an acceptable error tolerance.

### Mutable Properties

Effect does not clone generated inputs before evaluating them. A property that changes its input may change the
reported counterexample and make simplification or replay unreliable. Treat generated values as read-only, and create
mutable test data inside each property evaluation rather than sharing it between runs.

## Laws Can Still Miss Visible Bugs

Passing a familiar list of laws does not prove that every public operation is correct. Two values may represent the
same logical result while an operation accidentally depends on how they are stored internally.

Consider an immutable first-in-first-out queue represented by a front array and a reversed rear array. The balancing
and update operations below are correct, but `front` deliberately reads the last front element instead of the first:

```ts
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

interface Queue {
  readonly front: ReadonlyArray<number>
  readonly rear: ReadonlyArray<number>
}

const balance = (front: ReadonlyArray<number>, rear: ReadonlyArray<number>): Queue =>
  front.length === 0 ? { front: [...rear].reverse(), rear: [] } : { front, rear }

const empty = (): Queue => balance([], [])
const isEmpty = (queue: Queue): boolean => queue.front.length === 0

const enqueue = (value: number, queue: Queue): Queue => balance(queue.front, [value, ...queue.rear])

const dequeue = (queue: Queue): Queue => balance(queue.front.slice(1), queue.rear)

// Deliberately wrong: a FIFO queue should return queue.front[0].
const front = (queue: Queue): number => queue.front[queue.front.length - 1]!

const toArray = (queue: Queue): ReadonlyArray<number> => [
  ...queue.front,
  ...[...queue.rear].reverse()
]

const equals = (left: Queue, right: Queue): boolean => {
  const a = toArray(left)
  const b = toArray(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

const Item = Schema.Int.check(
  Schema.isBetween({ minimum: -100, maximum: 100 })
)
const Items = Schema.Array(Item).check(Schema.isMaxLength(8))
const NonEmptyItems = Items.check(Schema.isMinLength(1))

const item = Arbitrary.schema(Item)
const items = Arbitrary.schema(Items)
const nonEmptyItems = Arbitrary.schema(NonEmptyItems)

const queue = Arbitrary.all({
  front: items,
  rear: items
}).pipe(
  Arbitrary.map(({ front, rear }) => balance(front, rear))
)

const nonEmptyQueue = Arbitrary.all({
  front: nonEmptyItems,
  rear: items
}).pipe(
  Arbitrary.map(({ front, rear }) => balance(front, rear))
)
```

The queue is intended to satisfy these equations:

1. `isEmpty(empty()) === true`
2. `isEmpty(enqueue(x, q)) === false`
3. `front(enqueue(x, empty())) === x`
4. For non-empty `q`, `front(enqueue(x, q)) === front(q)`
5. `dequeue(enqueue(x, empty()))` equals `empty()`
6. For non-empty `q`, `dequeue(enqueue(x, q))` equals `enqueue(x, dequeue(q))`

All six pass, even with the broken `front` operation:

```ts
describe("queue laws", () => {
  it("Q1", () => assert.isTrue(isEmpty(empty())))

  it.prop("Q2", [item, queue], ([x, q]) => !isEmpty(enqueue(x, q)))

  it.prop("Q3", [item], ([x]) => front(enqueue(x, empty())) === x)

  it.prop(
    "Q4",
    [item, nonEmptyQueue],
    ([x, q]) => front(enqueue(x, q)) === front(q)
  )

  it.prop(
    "Q5",
    [item],
    ([x]) => equals(dequeue(enqueue(x, empty())), empty())
  )

  it.prop(
    "Q6",
    [item, nonEmptyQueue],
    ([x, q]) => equals(dequeue(enqueue(x, q)), enqueue(x, dequeue(q)))
  )
})
```

The equations compare queues through `equals`, which checks their logical sequence. But replacing a queue with an equal
queue must not change the answer returned by `front`.

We can test that hidden requirement by substituting both sides of Q6 into `front`:

```ts
it.prop(
  "front agrees after the Q6 rewrite",
  [item, nonEmptyQueue],
  ([x, q]) => {
    const left = dequeue(enqueue(x, q))
    const right = enqueue(x, dequeue(q))
    return front(left) === front(right)
  },
  {
    // This flag belongs only in the tutorial while `front` is intentionally broken.
    fails: true,
    arbitrary: {
      runs: 1_000,
      size: 10,
      seed: "front-after-rewrite"
    }
  }
)
```

This property fails and simplifies to a small queue. The first six laws say that two queue expressions are equal. The
new property also checks that `front` gives the same answer for both expressions.

The general lesson is simple: whenever a law says `left` and `right` are equal, try both values as inputs to public
operations. Their results should remain equal. This does not prove every possible combination, but it can reveal code
that accidentally reads an internal representation.

## Comparing with a Simple Model

Some systems are easier to check against a small, straightforward implementation than against a list of equations.
This simpler implementation is called a **model**. It may be slower than the real code; its advantage is that it is
easy to understand and trust.

The following property checks Effect's immutable `HashSet` against JavaScript's mutable `Set`. Instead of generating
sets directly, it generates command sequences and runs the same history against both implementations.

```ts
import { it } from "@effect/vitest"
import { HashSet, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const Key = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 20 })
)

const Command = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("Insert"), value: Key }),
  Schema.Struct({ _tag: Schema.Literal("Remove"), value: Key }),
  Schema.Struct({ _tag: Schema.Literal("Contains"), value: Key })
])

const commands = Arbitrary.schema(
  Schema.Array(Command).check(Schema.isMaxLength(50))
)

it.prop("HashSet agrees with the Set model", [commands], ([input]) => {
  const model = new Set<number>()
  let actual = HashSet.empty<number>()
  const modelTrace: Array<boolean> = []
  const actualTrace: Array<boolean> = []

  for (const command of input) {
    switch (command._tag) {
      case "Insert":
        model.add(command.value)
        actual = HashSet.add(actual, command.value)
        break

      case "Remove":
        model.delete(command.value)
        actual = HashSet.remove(actual, command.value)
        break

      case "Contains":
        modelTrace.push(model.has(command.value))
        actualTrace.push(HashSet.has(actual, command.value))
        break
    }
  }

  return modelTrace.length === actualTrace.length &&
    modelTrace.every((value, index) => value === actualTrace[index]) &&
    model.size === HashSet.size(actual) &&
    [...model].every((value) => HashSet.has(actual, value))
})
```

The property compares two things:

- the recorded answers verify each `Contains` operation;
- the final membership and size checks verify that both states ended with the same contents.

When this test fails, Effect simplifies the command list and its values. The final counterexample is often a short
history that clearly shows which state change the implementation handled incorrectly.

## Replaying a Failure

Every `Falsified` result contains a `replay` token. It is a string produced by Effect and is not meant to be edited. The
token records enough information to generate the same initial input and repeat the simplification steps that led to the
reported counterexample:

```ts
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const arbitrary = Arbitrary.schema(Schema.Int)

const program = Effect.gen(function*() {
  const first = yield* Arbitrary.checkEffect(arbitrary, (value) => value < 10, {
    seed: "integer-bound"
  })

  if (first._tag === "Falsified") {
    const replayed = yield* Arbitrary.checkEffect(
      arbitrary,
      (value) => value < 10,
      { replay: first.replay }
    )
    return replayed
  }

  return first
})
```

Store the token in logs or failure output when you want to reproduce a failure locally. Because this module is
unstable, a token created by one Effect release may not work with another. For a permanent regression test, copy the
final failing input into an ordinary example-based test.

When `replay` is present, its recorded settings replace `runs`, `size`, `maxDiscards`, `maxShrinks`, and `seed`.

Effect returns `ReplayMismatch` when the Schema, property, or generator has changed enough that the token no longer
leads to the same kind of failure. The token does not store the exact final input or exact Effect error, so replay may
still succeed if the error value changes while the property continues to fail in the same way.

## Sampling Options

`Arbitrary.sampleEffect` accepts the following options:

| Option        | Default                      | Meaning                                                    |
| ------------- | ---------------------------- | ---------------------------------------------------------- |
| `count`       | `10`                         | Number of values to return.                                |
| `size`        | `10`                         | Rough complexity of each generated value.                  |
| `maxDiscards` | `max(100, count * 10)`       | Maximum rejected values before failing with `SampleError`. |
| `seed`        | A value from Effect `Random` | String or number used to reproduce the generated sequence. |

If too many values are rejected, the Effect fails with a `SampleError`. The error contains the number of accepted and
rejected values and the seed used for the run. Passing that seed to another `sampleEffect` call repeats the run even if
the first call did not specify a seed.

## Check Options

`Arbitrary.checkEffect` accepts the following options:

| Option        | Default                      | Meaning                                                                |
| ------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `runs`        | `100`                        | Number of successful generations and property evaluations to complete. |
| `size`        | `10`                         | Largest approximate input complexity. It grows during the check.       |
| `maxDiscards` | `max(100, runs * 10)`        | Maximum rejected values before returning `Exhausted`.                  |
| `maxShrinks`  | `100`                        | Maximum simplifications tried after the first failure.                 |
| `seed`        | A value from Effect `Random` | String or number used to reproduce generation.                         |
| `replay`      | None                         | Token from a previous `Falsified` result.                              |

Rejected values do not count toward `runs`, and the input size does not grow after a rejection. When `runs` is `1`,
Effect uses the configured `size` immediately.

After a failure, `maxShrinks` counts every simpler input that Effect examines, including values rejected by a filter and
values that fail in a different way. The `shrinks` field in a `Falsified` result counts only the simplifications that
became the new best counterexample.

`size` is a guide rather than a maximum length for the whole result. Separate strings, collections, and object fields
may each use it. Recursive structures share it so that the complete value remains finite. Explicit Schema minimum and
maximum checks still take priority.

## How Effect Builds a Generator from Schema

This section is useful when a Schema contains custom checks, recursion, or declarations. If you only use ordinary
Schemas, you can skip to [Using `@effect/vitest`](#using-effectvitest).

`Arbitrary.schema` generates the value represented by a Schema after decoding. For example,
`Schema.NumberFromString` represents a number encoded as a string, so its generator produces numbers rather than
strings.

Effect prepares the generator when `Arbitrary.schema` is called. If it cannot support the Schema, the call throws
immediately rather than returning a generator that fails later.

### Schema Checks and Rejected Values

Effect can use many common Schema checks while generating values, including:

- minimum and maximum values, including values that use a custom `Order`;
- finite and integer numbers;
- minimum and maximum lengths for strings, collections, and object properties;
- supported regular-expression patterns;
- checks that collection values are unique.

For these checks, Effect produces matching values directly. It applies other custom checks after generation. A value
that fails one of those checks is rejected.

`maxDiscards` limits how many values may be rejected. An impossible or very selective check therefore produces
`SampleError` or `Exhausted` instead of searching forever.

### Custom Shrinking

The default simplification is usually enough: Effect removes collection items, moves numbers and strings toward
simpler values, and simplifies object or tuple fields one at a time while preserving Schema checks. Use the `shrink`
option when your application has a useful simplification that Effect cannot infer from the data structure.

For example, an addition expression can be replaced directly by either side. The default behavior cannot infer that
meaning from the object shape:

```ts
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

interface Literal {
  readonly _tag: "Literal"
  readonly value: number
}

interface Add {
  readonly _tag: "Add"
  readonly left: Expression
  readonly right: Expression
}

type Expression = Literal | Add

const Expression: Schema.Codec<Expression> = Schema.suspend(() =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal("Literal"),
      value: Schema.Int
    }),
    Schema.Struct({
      _tag: Schema.Literal("Add"),
      left: Expression,
      right: Expression
    })
  ])
)

const shrinkExpression = (expression: Expression): ReadonlyArray<Expression> => {
  switch (expression._tag) {
    case "Literal":
      return expression.value === 0 ? [] : [{ _tag: "Literal", value: 0 }]
    case "Add":
      return [
        expression.left,
        expression.right,
        ...shrinkExpression(expression.left).map((left) => ({ ...expression, left })),
        ...shrinkExpression(expression.right).map((right) => ({ ...expression, right }))
      ]
  }
}

const expressions = Arbitrary.schema(Expression, {
  shrink: shrinkExpression
})
```

Initial values still come from `Expression`. After a property fails, `shrinkExpression` tells Effect which simpler
values to try next. Replacing `Add(left, right)` with `left` or `right` can reach a useful counterexample much faster
than changing one field at a time.

Before the property sees a proposed value, Effect checks it with `Expression`. Invalid values are skipped and consume
one unit of `maxShrinks`; Effect does not ask the callback to simplify them further. The Schema therefore remains the
final authority even if the callback contains a cast or calls untyped code.

Effect calls the callback only after a property fails. It may call it again during simplification or replay. The
callback must therefore finish normally, always return the same proposed values for the same input, and avoid modifying
data. It should list the most useful simplifications first. Returning `[]` means that the current value cannot be
simplified.

A custom `shrink` callback replaces the default behavior. Keep the default when simplifying fields and collection
items is enough. Prefer `map` or `toCodecArbitrary` when you can generate a simpler representation and transform it.
Use `shrink` only for application-specific shortcuts that those approaches cannot express clearly.

### Recursive Schemas

Recursive Schemas are supported as long as there is a way for generation to stop:

```ts
import { Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

interface Node {
  readonly value: string
  readonly children: ReadonlyArray<Node>
}

const Node: Schema.Codec<Node> = Schema.Struct({
  value: Schema.String,
  children: Schema.Array(Schema.suspend(() => Node)).check(Schema.isMaxLength(3))
})

const nodes = Arbitrary.schema(Node)
```

Here, an empty `children` array stops the recursion. Effect limits recursion across the whole generated value so that
separate branches cannot each grow without regard for the others.

Effect ignores a recursive alternative that can never stop. If the complete Schema has no way to produce a finite
value, `Arbitrary.schema` throws immediately. You do not need to provide a special terminal generator or depth marker.

### Declaration Schemas

`Schema.declare` can describe a type whose internal structure is hidden from the generic Schema machinery. To generate
such a value, Effect looks for a simpler Schema representation in this order:

1. an explicit `toCodecArbitrary`;
2. a representation provided by Effect for one of its built-in types;
3. `toCodecJson`;
4. `toCodec`.

Most declarations already provide a usable conversion and need no Arbitrary-specific setup. Add `toCodecArbitrary`
only when the usual representation cannot be generated or produces poor test inputs.

If `toCodecJson` is present but returns `undefined`, the declaration explicitly says that its JSON representation is
hidden. Generation stops with an error instead of trying `toCodec`.

`toCodecArbitrary` returns a Schema `Link`, not an `Arbitrary`. The first Schema in the link describes values that are
easy to generate, and the transformation converts them into the declared type:

```ts
import { Schema, SchemaTransformation } from "effect"

class UserId {
  readonly value: number
  constructor(value: number) {
    this.value = value
  }
}

const UserIdSchema = Schema.instanceOf(UserId, {
  toCodecArbitrary: () =>
    Schema.link<UserId>()(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      SchemaTransformation.transform({
        decode: (value) => new UserId(value),
        encode: (id) => id.value
      })
    )
})
```

Effect checks converted values against the original declaration. The conversion may reject some values; those values
count toward `maxDiscards`, and Effect can continue with others. Normal decode errors reject a value, while unexpected
defects and interruption fail the sampling or checking Effect.

The callback also receives:

- the value types represented by declarations with type parameters;
- the common Schema checks that Effect recognized for the declaration.

Built-in collection types use arrays as their simpler generation representation. Map keys and set values remain
unique. Effect collections such as `HashMap`, `HashSet`, and `Chunk`, and types such as `Graph`, `BigDecimal`, and date
and time values, provide their own links when that produces better inputs. A declaration whose usual conversion already
works needs no Arbitrary-specific annotation.

## Using `@effect/vitest`

`@effect/vitest` accepts arrays or records containing Schemas, Arbitraries, or both:

```ts
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

const Name = Arbitrary.schema(Schema.Literals(["Ada", "Grace"]))

it.prop(
  "integer addition is commutative",
  [Schema.Int, Schema.Int],
  ([a, b]) => a + b === b + a,
  { arbitrary: { runs: 200, seed: "addition" } }
)

it.effect.prop(
  "generated values can be checked in an Effect",
  { name: Name, value: Schema.Int },
  ({ name, value }) =>
    Effect.sync(() => {
      assert.include(["Ada", "Grace"], name)
      assert.isTrue(Number.isInteger(value))
    }),
  { arbitrary: { runs: 50 } }
)
```

Generators from other property-testing libraries are not supported. Use Effect Arbitraries when an input needs more
composition than a Schema alone can provide.

`@effect/vitest` turns `Falsified`, `Exhausted`, and `ReplayMismatch` results into test failures. The failure message
includes the simplified failing input and replay token. Diagnostic values use `Formatter.format`, so strings remain quoted and
escaped, collections such as `Map` and `Set` retain their structure, and application values can provide a custom
`toString`.

The Vitest integration reports a property failure when the property returns `false`, throws, or returns a failed Effect
for a reason other than interruption. It then simplifies and reports the failing input. Effect interruption remains an
interruption. Any normal return value other than `false`, including `void`, passes for that input.

The Vitest `timeout` interrupts the Effect fiber that generates inputs, runs the property, and simplifies failures.
Effect finalizers still run. A timeout cannot stop a synchronous JavaScript callback until that callback returns.

## Current Limitations

The module starts from Schema and currently does not provide:

- a second catalog of Schema-like constructors for strings, numbers, and objects; describe those inputs with Schema;
- a public low-level generator constructor or direct access to simplification steps;
- weighted choice; use [targeted scenarios](#targeting-rare-scenarios) to guarantee that a test reaches an important
  situation;
- support for generators from other property-testing libraries;
- running generated inputs in parallel;
- automatic test failure messages outside `@effect/vitest`;
- replay tokens guaranteed to work across releases of this unstable module.

These limitations may change while the module remains unstable.

## Summary

Property-based testing is most useful when the property says more than “this function did not throw.” Start by choosing
the allowed inputs and a rule that comes from the requirement:

- use Schema checks to generate valid values;
- combine independent inputs with records, tuples, or `Arbitrary.all`;
- use `it.prop` and `it.effect.prop` in tests, and `checkEffect` when result values or replay are part of the
  program;
- write laws directly and remember the limits of JavaScript numbers;
- when two values are considered equal, check that public operations treat them the same way;
- use command sequences and a simple model for stateful behavior;
- pay attention to rejected values, simplification, and replay because they affect what the test actually checks.

The most important choice is not how many random inputs to generate. It is choosing inputs and a rule that make a small
counterexample useful.

## Appendix: Design and Implementation Decisions

This appendix is for people who maintain or extend the module. You can use `Arbitrary` without reading it. Internal type
names appear only where they help connect a decision to the code, and each one is explained when it first appears.

### Why Effect Has Its Own Implementation

Effect owns the property-testing implementation so it can provide:

- **Automatic support for recursion.** Effect finds the paths that let recursive Schemas stop. If no such path exists,
  `Arbitrary.schema` fails immediately. All recursive branches in one value share the same limit.
- **A limit on rejected values.** `maxDiscards` stops generation when a condition is impossible or accepts too few
  values. `maxShrinks` also limits rejected values examined while simplifying a failure.
- **Normal Effect behavior.** Sampling and checking can be interrupted, use services, and fail through Effect. Direct
  checks, `TestSchema`, and `@effect/vitest` use the same implementation.
- **Direct composition.** `all` combines existing Arbitraries without creating a temporary Schema.
- **One replay token.** The token records the initial attempt and every accepted simplification. Replay regenerates the
  initial value, runs the property again, and follows those simplifications.
- **Useful behavior for `flatMap`.** When the first generated value becomes simpler, Effect rebuilds the value that
  depends on it while keeping later random choices stable. Nested `flatMap` calls share the same recursion limit.
- **Small common paths.** Common Schema shapes use direct loops, and sampling does not build simplification data. Bundle
  and runtime benchmarks watch these paths, but do not promise an exact performance level.

### Interface Design Decisions

These decisions explain why the public API contains some operations and omits others. Each section also says what new
use case would justify changing the decision.

#### Use Schema as the Public Generation Language

**Status:** Use Schema as the single public language for describing generated data.

Schema already describes primitive values, data structures, checks, conversions, declarations, and recursion.
Duplicating those features with `Arbitrary.String`, `Arbitrary.Array`, and similar constructors would give users two
different ways to describe the same inputs.

The module therefore exposes `schema` and a small set of operations for combining existing Arbitraries. A declaration
whose structure is hidden can provide a simpler Schema through `toCodecArbitrary`; it does not need a second language
for generators.

`Arbitrary.array(item, options)` composes an existing element Arbitrary, including one built with `map`, `filter`,
`flatMap`, or `all`. It supports deleting commands while retaining the failing sequence's remaining values, which a
dependent length generator cannot preserve. Schema remains the place to describe primitive values and checked data
structures.

The implementation stored inside `Arbitrary<A>` remains private. Users can combine and run an Arbitrary without
depending on how Effect currently generates or simplifies values. Reconsider this decision only if an important input
cannot be described by Schema or built clearly from existing Arbitraries.

#### Keep Low-Level Arbitrary Construction Internal

**Status:** Do not expose `Arbitrary.make` for the current internal generator type.

Applications can already build inputs through:

- `Arbitrary.schema` for primitive values, data structures, checked values, and recursive values;
- `Constant` for lifting an already constructed value into dependent generation;
- `map`, `filter`, `filterMap`, `flatMap`, and `all` for composition;
- `toCodecArbitrary` when a Schema declaration hides its structure and needs a simpler Schema for generation.

The internal `Generator` does more than turn random numbers into values. It also tracks the minimum space needed for
recursion, rejected values, later simplifications, interruption, and replay positions. Exposing it would require every
custom generator to understand those rules.

A simpler public constructor that ignores some rules would create Arbitraries that behave differently when combined or
simplified. Reconsider this decision when at least two real generators cannot be expressed through Schema and the
existing operations. Any proposal should keep the internal bookkeeping out of application code.

#### Provide a Constant Constructor

**Status:** Provide `Arbitrary.Constant` for an existing value.

Without `Constant`, callers must generate an unrelated value and map it to the desired constant. `Schema.Literal`
supports only literal values and is awkward to rebuild repeatedly inside `flatMap`.

`Constant` uses no randomness and offers no simpler values of its own. The value that selected it through `flatMap` can
still be simplified. Every run returns the same value, so objects are not cloned and properties must not modify them.

#### Use Schema Union for Static Choice

**Status:** Do not add a second operation for choosing uniformly among fixed alternatives.

`Arbitrary.schema(Schema.Union([...]))` already chooses among alternatives. Because the alternatives remain Schemas,
Effect can see their checks, recursion needs, and validation rules. `Arbitrary.oneOf` would duplicate that behavior
without supporting a new use case.

A weighted choice would add probabilities, but probabilities do not guarantee that a property reaches an important
situation. The later decision about weighted choice explains the preferred alternative.

#### Keep Size Management Internal

**Status:** Do not pass the current `size` to an `Arbitrary.sized` callback.

The runner's `size` option already lets strings, collections, and recursive Schemas become more complex as a check
progresses. Most users therefore do not need to write their own size rules.

Passing this value to callbacks would make the runner's growth policy part of the public composition API. It is mainly
useful for low-level custom generators, which the module does not currently expose. Reconsider this decision when an
important input needs a size rule that Schema checks and recursion cannot describe.

#### Keep Custom Shrinking at the Schema Boundary

**Status:** Add custom simplification only through `Arbitrary.schema(schema, { shrink })`.

The Schema produces every initial value and checks every value proposed by the callback. Invalid proposals are skipped;
valid proposals can be simplified again with the same callback. Effect calls the callback only when needed and records
its stable order for replay.

The callback replaces the default simplification order. Mixing two independent orders would make `maxShrinks` and
replay positions hard to predict.

A general `Arbitrary.reshrink` could not provide the same automatic validation. An Arbitrary built with `Constant`,
`map`, `flatMap`, or `all` does not retain one original Schema. Reconsider a general operation only when a real input
cannot be represented by Schema and needs its own simplification. A proposal must explain how values are checked, how
the two simplification strategies interact, and how replay remains stable.

#### Prefer Targeted Scenarios to Weighted Choice

**Status:** Do not add `Arbitrary.frequency` merely to reach important test cases more often.

Weights only change how often a branch is chosen. They cannot guarantee the combination of values that makes a behavior
important. A general property over `Schema.Union`, plus a focused property whose input already contains the important
situation, states the requirement directly and preserves it during simplification.

Workloads that must match real probabilities belong in simulations or benchmarks. Reconsider weighted generation only
if a correctness rule itself depends on a distribution, rather than merely needing better test coverage.

#### Name Effectful Runners Explicitly

**Status:** Keep the `Effect` suffix on `sampleEffect` and `checkEffect`.

The names show that these functions return an Effect. They also leave clear names available if a real need for
synchronous versions appears later; no such version is currently promised.

#### Current Interface Scope

The module focuses on inputs described by Schema and checks executed with Effect. It guarantees that generated values
match their Schema, rejection is limited, recursion stops, and replay works within the same implementation. Exact
generated sequences, probabilities, and intermediate simplifications may change.

The unstable interface does not currently expose:

- a second catalog of Schema-like constructors, or direct access to internal samples and simplification steps;
- weighted distribution controls;
- custom simplification that is not attached to a Schema;
- support for generators from other libraries or a broad set of runner settings;
- parallel property evaluation;
- test-runner assertion integration outside `@effect/vitest`;
- replay tokens guaranteed to work across releases.

These omissions are not necessarily permanent. They let Schema remain responsible for describing valid values and let
Effect change the internal generator while each proposed API addition is considered separately.

### Technical Decisions

The remaining sections describe the current implementation. These details matter to maintainers because changing them
can alter generated values, simplification, replay, performance, or bundle size without changing the public types.

#### Representing Generation

- The internal `Generator<A>` stores `minCost`, the minimum space needed to produce a value, and `generate`, the
  generation function. A Schema being prepared uses `Compiled<A>`, which also records its dependencies. Arbitrary
  operations outside Schema do not join that dependency graph.
- One call returns `Generated` when it produced a value or `Discarded` when it rejected the attempt. It returns directly
  when possible and uses an Effect only when needed. Internal mapping uses Effect's eager operations so an immediate
  result remains synchronous.
- A generated value may provide a `Pull`: an internal operation that returns one proposed simplification at a time.
  Effect creates this sequence only when needed. Sampling does not create it, and rejected proposals remain visible to
  the runner so they count toward `maxShrinks`. Operations such as `filter` can skip a rejected proposal and continue
  with simpler values that follow from it.

#### Preparing a Schema

- Preparation starts with `SchemaAST.toType`, which selects the value after decoding rather than its encoded form.
- The implementation reads Schema's existing internal syntax tree, called its AST, instead of creating a second tree
  for Arbitrary. This preserves the original order of checks, declaration links, type parameters, recursive references,
  and error paths.
- Preparation happens immediately and reuses work for repeated nodes in the same Schema. Unsupported declarations,
  contradictory bounds, and recursion with no stopping point fail during `Arbitrary.schema`. Combinations that are
  valid but impossible to satisfy eventually return `SampleError` or `Exhausted`.
- Effect builds common checks into generation and still runs the original checks afterward. Ordinary Schema nodes do
  not use the complete Schema parser for every value. Declaration links are converted and then checked against the
  original declaration.
- For supported regular expressions, Effect generates matching text directly and checks the pattern afterward. It
  chooses uniformly among supported patterns. Unsupported patterns act as ordinary filters instead of making the
  complete Schema unsupported.
- Prepared patterns cache valid UTF-16 lengths and reusable character information. The same information helps simplify
  generated strings without changing which strings the pattern accepts.

#### Declarations

- Effect looks for a declaration representation in this order: `toCodecArbitrary`, a built-in representation,
  `toCodecJson`, then `toCodec`. If `toCodecJson()` returns `undefined`, the declaration says its JSON form is hidden,
  so preparation stops instead of silently trying another conversion.
- `toCodecArbitrary` returns a Schema `Link`. Effect generates the source Schema, converts it, and checks the result
  against the original declaration. Rejected initial values count toward `maxDiscards`; rejected simplifications count
  toward `maxShrinks` while later valid proposals remain available.
- The callback receives the represented type parameters and the common checks Effect recognized. `ReadonlyMap` and
  `ReadonlySet` use arrays internally. `HashMap`, `HashSet`, `Chunk`, and other specialized types keep local links when
  that avoids loading their implementation into every use of the generic Schema compiler.
- Effect may use an `Order` while combining bounds, but passes only the final bounds to `toCodecArbitrary`. The link is
  responsible for producing suitable values, and the original declaration rejects incompatible results.
- Links used only for generation cannot encode values; generation calls only their decode direction.

#### Recursion and Size

- Effect examines recursive references as a graph and computes the minimum space needed to reach a non-recursive value.
  A recursive alternative that can never stop is ignored; a complete Schema that can never stop is rejected
  immediately.
- Each attempt receives the minimum required space plus the configured `size`. Crossing a recursive reference consumes
  some of that allowance. Effect reserves enough for required child values before generating optional siblings.
  Recursive siblings are tried in a changing order so one declaration position does not always receive more space, but
  the returned object keeps its declared order.
- Every recursive branch in the generated value shares one allowance. Nested composition does not create fresh space.
- Strings and collections also use `size` as a rough complexity target. Sampling uses a fixed value; checking raises it
  after successful runs. Schema minimums are always respected, maximums remain limits, and rejected attempts do not
  increase the size.

#### Randomness and Probabilities

- The runner starts from one seed and creates a separate random-number state for each attempt. Replay can therefore jump
  directly to a recorded attempt, and a property's use of Effect `Random` cannot change later generated inputs.
- On some predictable attempts, generated records have no prototype. Choosing this case does not consume a random
  number, and every record produced during that attempt uses the same choice, including simplified values. This applies
  to `Schema.Struct`, `Schema.Record`, `Schema.Json`, and record-shaped `all`, but not to arrays, tuples, declarations, or
  collection classes.
- Integer and BigInt generation avoids favoring some values accidentally. It tries boundary values more often on some
  runs. Unbounded BigInts select their bit length separately from their value, mixing ordinary magnitudes with much
  wider values even at a small `size`. Number generation includes signed zero, very small values, infinities, and `NaN`
  when the Schema permits them. Finite and integer checks exclude the values they promise to exclude.
- BigDecimal generation selects precision and decimal exponent independently, while ordered constraints are projected
  to the selected scale. Its simplifications operate on the represented numeric value, so a fixed generated scale does
  not dictate the final counterexample. Local simplification continues between passing and failing values with a finite
  limit on added precision. Ordinary strings combine printable ASCII with a fixed set of JavaScript edge cases.
  Regular-expression length is measured in UTF-16 code units, matching JavaScript strings.
- Exact probabilities, the value produced by a particular seed, and the order of simplifications may change. Source
  code comments credit algorithms adapted from other property-testing and random-number implementations.

#### Generating and Simplifying Data Structures

- Arrays try removing progressively smaller blocks at successive positions and simplifying individual items. Deletions
  retain the other elements and their shrink history, so an earlier element candidate can be tried again after deletion
  changes the property context. This history is lazy and local to a collection generation. Products and objects also
  retain shared child histories, so exploring a filtered descendant cannot exhaust a sibling's shrink candidates.
  Ordinary field shrinking continues from the field being simplified; structural deletions restart field traversal.
  Tuple prefixes and fixed tails cannot be deleted; optional positions can only be removed from the end when the tuple
  permits it. Whole-array minima apply to every deletion. Objects choose optional properties without favoring earlier
  declarations. If the first choice is too large for the available recursion space, Effect
  uses the smallest choice that still satisfies the Schema instead of rejecting a Schema that can produce a value.
  Simplification removes optional properties, simplifies values, and then simplifies generated keys while keeping keys
  unique.
- Generation of unique collections has a retry limit. `Schema.isUnique()` compares complete values;
  `Schema.isUniqueKey()` compares the keys of Map entries. Both use Effect equality. Primitive values use specialized
  tracking, while objects use Effect `Hash` and `Equal`.
- A Schema union chooses uniformly among alternatives that fit in the remaining recursion space. During simplification,
  it first tries the earliest alternative with the lowest required space when that alternative is cheaper, then
  simplifies the selected alternative. Separate random-number state keeps unrelated later values from changing this
  fallback. For `oneOf`, a value must match exactly one alternative; overlaps are rejected.
- `all` adds the minimum space required by its members and makes them share one recursion allowance. It changes their
  internal generation order for fairness, then restores tuple positions and record keys. Simplification changes one
  member at a time.
- `map` transforms every proposed value without consuming randomness or changing replay positions. `filter` and
  `filterMap` reject values that do not pass their condition. During simplification, Effect skips rejected proposals and
  can continue to later valid ones. `map` keeps duplicate transformed values because removing them would change replay
  positions. Each rejection consumes one unit of `maxShrinks` without running the property.
- `filterMap` ignores the failure value in `Result`. Separate implementations for `map` and `filter` avoid allocating a
  `Result` in these common cases.
- `Arbitrary.schema(schema, { shrink })` keeps normal generation but replaces default simplification. Effect calls the
  callback only when needed and checks each proposal against the Schema value after decoding. Invalid proposals consume
  `maxShrinks`, never reach the property, and are not simplified further.

#### Dependent Generation with `flatMap`

- Effect first generates the source value, calls the callback, and then runs the Arbitrary selected by that callback.
  The selected Arbitrary always receives enough space to produce its smallest possible value.
- Simplification starts with the source. Each simpler source value selects a new dependent Arbitrary. Effect later tries
  simpler values from the current dependent Arbitrary. Once it accepts one of those dependent values, it no longer
  returns to source simplification on that path.
- If the initial source or dependent Arbitrary rejects its value, the complete attempt is rejected. If a dependent value
  selected during simplification is rejected, it consumes one unit of `maxShrinks`, and Effect continues with later
  simplifications of the source.
- Sampling needs no saved random state because it does not simplify values. Checking saves the random state immediately
  after source generation. The initial dependent value and every dependent value chosen from a simpler source receive a
  separate copy, so trying one simplification cannot change another or affect later generated inputs.
- The dependent Arbitrary temporarily receives the minimum extra recursion space it needs. Any unused extra space is
  removed afterward, so nested `flatMap` calls still share one overall allowance.
- Calling `Arbitrary.schema` inside the callback prepares that Schema on every callback call. Effect does not cache it
  automatically.

#### Running, Replaying, and Interrupting Checks

- `sampleEffect` fails with `SampleError`. `checkEffect` returns `Passed`, `Falsified`, `Exhausted`, or
  `ReplayMismatch`. `SampleError` and `Exhausted` include the seed so the run can be repeated. Only the boolean `true`
  passes. Returning `false` and returning a failed Effect are different kinds of property failure, and simplification
  preserves the original kind. The exact Effect error may change. Unexpected defects and interruption remain Effect
  failures rather than result values.
- After a failure, Effect follows the first proposed simpler value that fails in the same way. `maxShrinks` counts every
  proposal examined, including rejected values; `shrinks` counts only proposals accepted as the new counterexample.
  Property runs do not include these extra evaluations. When the limit is reached, Effect returns the most simplified
  failing input found so far. It does not clone or freeze generated values.
- A replay token records the seed, attempt number, size, original kind of failure, and the position of every accepted
  simplification. Replay rebuilds those values instead of storing them in the token. It returns `ReplayMismatch` when a
  position no longer exists or no longer fails in the same way. It does not compare the exact final input or Effect
  error. Malformed tokens may fail with a defect, and tokens need not work across releases while the module is unstable.
  Replay follows the recorded positions directly, so it ignores `maxShrinks`.
- Long synchronous generation loops occasionally yield control according to `Scheduler.MaxOpsBeforeYield`. Generation
  that uses Effects, declaration conversion, property evaluation, and simplification can all be interrupted normally.
