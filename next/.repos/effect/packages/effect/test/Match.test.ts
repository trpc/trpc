import { describe, it } from "@effect/vitest"
import { Match, pipe } from "effect"
import { strictEqual } from "./utils/assert.ts"

describe("Match", () => {
  it("fn keeps the selector arguments", () => {
    type Todo = { readonly completed: boolean }
    type Todos = Array<Todo>
    type Filter = "All" | "Active" | "Completed"

    const filterTodos = Match.fn((_todos: Todos, filter: Filter) => filter).pipe(
      Match.withReturnType<Todos>(),
      Match.when("All", (_filter, todos) => todos),
      Match.when("Active", (_filter, todos) => todos.filter((todo) => !todo.completed)),
      Match.when("Completed", (_filter, todos) => todos.filter((todo) => todo.completed)),
      Match.exhaustive
    )
    const todos: Todos = [{ completed: false }, { completed: true }]

    strictEqual(filterTodos(todos, "All"), todos)
    strictEqual(filterTodos(todos, "Active").length, 1)
    strictEqual(filterTodos(todos, "Active")[0], todos[0])
    strictEqual(filterTodos(todos, "Completed").length, 1)
    strictEqual(filterTodos(todos, "Completed")[0], todos[1])
  })

  it("fn can match a projected value", () => {
    type Todo = { readonly status: "Active" | "Completed"; readonly title: string }
    const formatTodo = Match.fn((todo: Todo) => todo.status).pipe(
      Match.when("Active", (_status, todo) => `Active: ${todo.title}`),
      Match.when("Completed", (_status, todo) => `Completed: ${todo.title}`),
      Match.exhaustive
    )

    strictEqual(formatTodo({ status: "Active", title: "Write tests" }), "Active: Write tests")
  })

  it("tag matches an exact _tag and falls through for null", () => {
    const match = pipe(
      Match.type<{ _tag: "A" } | null>(),
      Match.tag("A", () => "hit"),
      Match.orElse(() => "miss")
    )

    strictEqual(match({ _tag: "A" }), "hit")
    strictEqual(match(null), "miss")
  })

  it("tagStartsWith matches a _tag prefix and falls through otherwise", () => {
    const match = pipe(
      Match.type<{ _tag: "A.one" } | null>(),
      Match.tagStartsWith("A", () => "hit"),
      Match.orElse(() => "miss")
    )

    strictEqual(match({ _tag: "A.one" }), "hit")
    strictEqual(match(null), "miss")
  })

  it("literalsExhaustive dispatches string and numeric literals to their handlers", () => {
    const match = pipe(
      Match.type<"draft" | 404>(),
      Match.literalsExhaustive({
        draft: (value) => `string:${value}`,
        404: (value) => `number:${value}`
      })
    )

    strictEqual(match("draft"), "string:draft")
    strictEqual(match(404), "number:404")
  })

  it("literals only uses own handler keys and falls through otherwise", () => {
    const match = pipe(
      Match.type<"draft" | "review" | "toString" | null>(),
      Match.literals({ draft: () => "draft", review: () => "review" }),
      Match.orElse(() => "miss")
    )

    strictEqual(match("review"), "review")
    strictEqual(match("toString"), "miss")
    strictEqual(match(null), "miss")
  })

  it("checks symbol-keyed object pattern properties", () => {
    const key = Symbol("key")
    const match = pipe(
      Match.type<{ readonly [key]: "expected" | "other" }>(),
      Match.when({ [key]: "expected" }, () => "hit"),
      Match.orElse(() => "miss")
    )

    strictEqual(match({ [key]: "expected" }), "hit")
    strictEqual(match({ [key]: "other" }), "miss")
    strictEqual(match({} as any), "miss")
  })

  it("array patterns match prefixes and reject shorter arrays", () => {
    const match = Match.type<ReadonlyArray<number>>().pipe(
      Match.when([Match.any, Match.any], () => "hit"),
      Match.orElse(() => "miss")
    )

    strictEqual(match([1]), "miss")
    strictEqual(match([1, 2]), "hit")
    strictEqual(match([1, 2, 3]), "hit")
  })
})
