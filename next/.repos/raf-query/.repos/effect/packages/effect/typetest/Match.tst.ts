import { Effect, Match, Option, pipe, type Result, Schema } from "effect"
import { describe, expect, it } from "tstyche"

type Closed = { readonly _tag: "Closed" }

type Todo = { readonly completed: boolean }
type Todos = Array<Todo>
type Filter = "All" | "Active" | "Completed"

declare const stringOrNumber: string | number
declare const taggedInput:
  | { readonly _tag: "A"; readonly a: string }
  | { readonly _tag: "B"; readonly b: number }
declare const discriminatedInput:
  | { readonly kind: "A"; readonly a: string }
  | { readonly kind: "B"; readonly b: number }

describe("Match", () => {
  it("fn infers the selected value and original arguments", () => {
    const filterTodos = Match.fn((_todos: Todos, filter: Filter) => filter).pipe(
      Match.when("All", (_filter, todos) => todos),
      Match.when("Active", (_filter, todos) => todos.filter((todo) => !todo.completed)),
      Match.when("Completed", (_filter, todos) => todos.filter((todo) => todo.completed)),
      Match.exhaustive
    )

    expect(filterTodos).type.toBe<
      (
        todos: Todos,
        filter: Filter
      ) => Todos
    >()

    const withoutExtraParameters = Match.fn((_todos: Todos, filter: Filter) => filter).pipe(
      Match.when("All", () => "all" as const),
      Match.orElse(() => "filtered" as const)
    )
    expect(withoutExtraParameters).type.toBe<(todos: Todos, filter: Filter) => "all" | "filtered">()

    Match.fn((_todos: Todos, filter: Filter) => filter).pipe(
      // @ts-expect-error Argument of type
      Match.when("All", (_filter, _todos: Array<string>) => "all")
    )
  })

  it("fn threads arguments through handlers and terminals", () => {
    const whenOr = Match.fn((_prefix: string, value: "a" | "b" | "c") => value).pipe(
      Match.whenOr("a", "b", (_value, prefix) => prefix.length),
      Match.when("c", (_value, prefix) => prefix.length),
      Match.exhaustive
    )
    expect(whenOr).type.toBe<(prefix: string, value: "a" | "b" | "c") => number>()

    const whenAnd = Match.fn((_context: boolean, value: { readonly kind: "a"; readonly active: boolean }) => value)
      .pipe(
        Match.whenAnd({ kind: "a" }, { active: true }, (_value, context) => context),
        Match.orElse((_value, context) => context)
      )
    expect(whenAnd).type.toBe<
      (
        context: boolean,
        value: { readonly kind: "a"; readonly active: boolean }
      ) => boolean
    >()

    const not = Match.fn((_context: boolean, value: "a" | "b") => value).pipe(
      Match.not("a", (_value, context) => context),
      Match.orElse((_value, context) => context)
    )
    expect(not).type.toBe<(context: boolean, value: "a" | "b") => boolean>()

    type Event = { readonly _tag: "A" } | { readonly _tag: "B" }
    const tag = Match.fn((_context: boolean, event: Event) => event).pipe(
      Match.tag("A", (_event, context) => context),
      Match.tag("B", (_event, context) => context),
      Match.exhaustive
    )
    expect(tag).type.toBe<(context: boolean, event: Event) => boolean>()

    const partial = Match.fn((_prefix: string, value: string | number) => value).pipe(
      Match.when(Match.string, (value, prefix) => prefix + value)
    )
    expect(partial.pipe(Match.option)).type.toBe<
      (prefix: string, value: string | number) => Option.Option<string>
    >()
    expect(partial.pipe(Match.result)).type.toBe<
      (prefix: string, value: string | number) => Result.Result<string, number>
    >()
  })

  it("value matchers resolve terminals for generic inputs", () => {
    // https://github.com/Effect-TS/effect/issues/7315
    const orElse = <Open extends { readonly _tag: "Open" }>(
      state: Closed | Open,
      describeOpen: (open: Open) => string
    ): string =>
      Match.value(state).pipe(
        Match.tag("Closed", () => "closed"),
        Match.orElse((open) => describeOpen(open))
      )
    expect(orElse({ _tag: "Closed" }, () => "open")).type.toBe<string>()

    const option = <Open extends { readonly _tag: "Open" }>(
      state: Closed | Open
    ): Option.Option<Open> =>
      Match.value(state).pipe(
        Match.tag("Closed", () => Option.none()),
        Match.orElse((open) => Option.some(open))
      )
    expect(option<{ readonly _tag: "Open" }>({ _tag: "Closed" })).type.toBe<Option.Option<{ readonly _tag: "Open" }>>()

    const terminalOption = <Open extends { readonly _tag: "Open" }>(
      state: Closed | Open
    ): Option.Option<string> =>
      Match.value(state).pipe(
        Match.tag("Closed", () => "closed"),
        Match.option
      )
    expect(terminalOption({ _tag: "Closed" })).type.toBe<Option.Option<string>>()

    const terminalResult = <Open extends { readonly _tag: "Open" }>(
      state: Closed | Open
    ): Result.Result<string, Open> =>
      Match.value(state).pipe(
        Match.tag("Closed", () => "closed"),
        Match.result
      )
    expect(terminalResult<{ readonly _tag: "Open" }>({ _tag: "Closed" })).type.toBe<
      Result.Result<string, { readonly _tag: "Open" }>
    >()

    const freePipe = <Open extends { readonly _tag: "Open" }>(
      state: Closed | Open
    ): string =>
      pipe(
        Match.value(state),
        Match.tag("Closed", () => "closed"),
        Match.orElse(() => "open")
      )
    expect(freePipe({ _tag: "Closed" })).type.toBe<string>()
  })

  it("value matchers return values for non-generic inputs", () => {
    expect(
      Match.value(stringOrNumber).pipe(
        Match.when(Match.number, (n) => n),
        Match.when(Match.string, (s) => s),
        Match.exhaustive
      )
    ).type.toBe<string | number>()

    expect(
      Match.value(stringOrNumber).pipe(
        Match.when(Match.number, (n) => n),
        Match.option
      )
    ).type.toBe<Option.Option<number>>()

    expect(
      Match.value(stringOrNumber).pipe(
        Match.when(Match.number, (n) => n),
        Match.result
      )
    ).type.toBe<Result.Result<number, string>>()

    expect(
      Match.value(stringOrNumber).pipe(
        Match.when(Match.number, (n) => n),
        Match.orElse((s) => s)
      )
    ).type.toBe<string | number>()
  })

  it("type matchers still return functions", () => {
    expect(
      Match.type<string | number>().pipe(
        Match.when(Match.number, (n) => n),
        Match.when(Match.string, (s) => s),
        Match.exhaustive
      )
    ).type.toBe<(u: string | number) => string | number>()

    expect(
      Match.type<string | number>().pipe(
        Match.when(Match.number, (n) => n),
        Match.option
      )
    ).type.toBe<(u: string | number) => Option.Option<number>>()
  })

  it("exhaustiveness checking is preserved", () => {
    const incomplete = Match.value(stringOrNumber).pipe(
      Match.when(Match.number, (n) => n)
    )
    const complete = Match.value(stringOrNumber).pipe(
      Match.when(Match.number, (n) => n),
      Match.when(Match.string, (s) => s)
    )
    // @ts-expect-error Argument of type
    Match.exhaustive(incomplete)
    expect(Match.exhaustive(complete)).type.toBe<string | number>()
  })

  it("tagsExhaustive contextually types Effect.fn handlers", () => {
    Match.value(taggedInput).pipe(
      Match.tagsExhaustive({
        A: Effect.fn(function*(value) {
          expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
          return value.a
        }),
        B: Effect.fnUntraced(function*(value) {
          expect(value).type.toBe<{ readonly _tag: "B"; readonly b: number }>()
          return value.b
        })
      })
    )
  })

  it("Effect.fn handler return types survive", () => {
    expect(
      Match.value(taggedInput).pipe(
        Match.tagsExhaustive({
          A: Effect.fn(function*(value) {
            return value.a
          }),
          B: Effect.fnUntraced(function*(value) {
            return value.b
          })
        })
      )
    ).type.toBe<Effect.Effect<string | number>>()
  })

  it("tagsExhaustive rejects missing and unknown tags", () => {
    Match.value(taggedInput).pipe(
      // @ts-expect-error Property 'B' is missing
      Match.tagsExhaustive({ A: (value) => value.a })
    )

    Match.value(taggedInput).pipe(
      Match.tagsExhaustive({
        A: (value) => value.a,
        B: (value) => value.b,
        // @ts-expect-error Type '() => number' is not assignable to type 'never'
        C: () => 1
      })
    )
  })

  it("valueTags rejects the unknown tag in the Schema union reproduction", () => {
    // https://github.com/Effect-TS/effect/issues/8167
    const Vehicles = Schema.Union([
      Schema.TaggedStruct("Car", {}),
      Schema.TaggedStruct("Bike", {})
    ])
    const myVehicle: typeof Vehicles.Type = { _tag: "Bike" }

    // @ts-expect-error Type '() => string' is not assignable to type 'never'
    Match.valueTags(myVehicle, { Plane: () => "plane" })
  })

  it("valueTags rejects missing and unknown tags", () => {
    // @ts-expect-error Type '() => boolean' is not assignable to type 'never'
    Match.valueTags(taggedInput, { A: () => "a", B: () => 1, C: () => true })

    // @ts-expect-error Property 'B' is missing
    Match.valueTags(taggedInput, { A: () => "a" })

    // @ts-expect-error Type '{}' is missing the following properties
    Match.valueTags(taggedInput, {})

    pipe(
      taggedInput,
      // @ts-expect-error Type '() => boolean' is not assignable to type 'never'
      Match.valueTags({ A: () => "a", B: () => 1, C: () => true })
    )

    pipe(
      taggedInput,
      // @ts-expect-error Property 'B' is missing
      Match.valueTags({ A: () => "a" })
    )
  })

  it("valueTags infers handler inputs and the union of return types", () => {
    const result = Match.valueTags(taggedInput, {
      A: (value) => {
        expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
        return value.a
      },
      B: (value) => {
        expect(value).type.toBe<{ readonly _tag: "B"; readonly b: number }>()
        return value.b
      }
    })
    expect(result).type.toBe<string | number>()

    expect(
      pipe(
        taggedInput,
        Match.valueTags({
          A: (value) => {
            expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
            return value.a
          },
          B: (value) => {
            expect(value).type.toBe<{ readonly _tag: "B"; readonly b: number }>()
            return value.b
          }
        })
      )
    ).type.toBe<string | number>()
  })

  it("related handler maps contextually type nested Effect.fn calls", () => {
    Match.value(taggedInput).pipe(
      Match.tags({
        A: Effect.fn(function*(value) {
          expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
          return value.a
        })
      })
    )

    Match.value(discriminatedInput).pipe(
      Match.discriminators("kind")({
        A: Effect.fn(function*(value) {
          expect(value).type.toBe<{ readonly kind: "A"; readonly a: string }>()
          return value.a
        })
      }),
      Match.discriminatorsExhaustive("kind")({
        B: Effect.fnUntraced(function*(value) {
          expect(value).type.toBe<{ readonly kind: "B"; readonly b: number }>()
          return value.b
        })
      })
    )

    pipe(
      taggedInput,
      Match.valueTags({
        A: Effect.fn(function*(value) {
          expect(value).type.toBe<{ readonly _tag: "A"; readonly a: string }>()
          return value.a
        }),
        B: Effect.fnUntraced(function*(value) {
          expect(value).type.toBe<{ readonly _tag: "B"; readonly b: number }>()
          return value.b
        })
      })
    )
  })
})
