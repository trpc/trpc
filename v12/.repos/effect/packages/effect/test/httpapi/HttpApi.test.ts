import { assert, describe, it } from "@effect/vitest"
import { Context } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"

describe("HttpApi", () => {
  it("stores the supplied identifier", () => {
    const api = HttpApi.make("Api")

    assert.strictEqual(api.identifier, "Api")
  })

  it("initializes groups as a readonly record", () => {
    const api = HttpApi.make("Api")

    assert.deepStrictEqual(api.groups, {})
  })

  it("stores __proto__ group and endpoint identifiers as own properties", () => {
    const group = HttpApiGroup.make("__proto__").add(
      HttpApiEndpoint.get("__proto__", "/proto")
    )
    const child = HttpApi.make("Child").add(group)
    const api = HttpApi.make("Api").addHttpApi(child)

    assert.isTrue(Object.hasOwn(group.endpoints, "__proto__"))
    assert.isTrue(Object.hasOwn(child.groups, "__proto__"))
    assert.isTrue(Object.hasOwn(api.groups, "__proto__"))
    assert.isTrue(Object.hasOwn(api.groups["__proto__"].endpoints, "__proto__"))

    const reflected: Array<string> = []
    HttpApi.reflect(api, {
      onGroup: ({ group }) => reflected.push(group.identifier),
      onEndpoint: ({ endpoint }) => reflected.push(endpoint.identifier)
    })
    assert.deepStrictEqual(reflected, ["__proto__", "__proto__"])
  })

  it("does not mutate groups from the added API", () => {
    const group = HttpApiGroup.make("users").annotate(OpenApi.Title, "Users")
    const child = HttpApi.make("Child")
      .annotate(OpenApi.Description, "Child API")
      .add(group)
    const originalAnnotations = group.annotations

    const parent = HttpApi.make("Parent").addHttpApi(child)

    assert.strictEqual(group.annotations, originalAnnotations)
    assert.strictEqual(child.groups.users, group)
    assert.notStrictEqual(parent.groups.users, group)
    assert.strictEqual(Context.getUnsafe(parent.groups.users.annotations, OpenApi.Title), "Users")
    assert.strictEqual(Context.getUnsafe(parent.groups.users.annotations, OpenApi.Description), "Child API")
  })

  it("does not add inherited groups", () => {
    const inherited = HttpApiGroup.make("inherited")
    const child = HttpApi.make("Child").add(HttpApiGroup.make("own"))
    Object.setPrototypeOf(child.groups, { inherited })

    const parent = HttpApi.make("Parent").addHttpApi(child)

    assert.isTrue(Object.hasOwn(parent.groups, "own"))
    assert.isFalse(Object.hasOwn(parent.groups, "inherited"))
  })

  it("keeps annotations from API variants isolated", () => {
    const group = HttpApiGroup.make("users").annotate(OpenApi.Title, "Users")
    const child = HttpApi.make("Child").add(group)
    const publicChild = child.annotate(OpenApi.Description, "Public API")
    const internalChild = child.annotate(OpenApi.Description, "Internal API")

    const publicParent = HttpApi.make("PublicParent").addHttpApi(publicChild)
    const internalParent = HttpApi.make("InternalParent").addHttpApi(internalChild)

    assert.strictEqual(Context.getUnsafe(publicParent.groups.users.annotations, OpenApi.Description), "Public API")
    assert.strictEqual(Context.getUnsafe(internalParent.groups.users.annotations, OpenApi.Description), "Internal API")
    assert.notStrictEqual(publicParent.groups.users, internalParent.groups.users)

    const publicTag = OpenApi.fromApi(publicParent).tags.find((tag) => tag.name === "Users")
    const internalTag = OpenApi.fromApi(internalParent).tags.find((tag) => tag.name === "Users")
    assert.isDefined(publicTag)
    assert.isDefined(internalTag)
    assert.strictEqual(publicTag.description, "Public API")
    assert.strictEqual(internalTag.description, "Internal API")
  })

  it("preserves group annotation precedence", () => {
    const group = HttpApiGroup.make("users").annotate(OpenApi.Title, "Group title")
    const child = HttpApi.make("Child")
      .annotate(OpenApi.Title, "API title")
      .add(group)

    const parent = HttpApi.make("Parent").addHttpApi(child)

    assert.strictEqual(Context.getUnsafe(parent.groups.users.annotations, OpenApi.Title), "Group title")
  })
})
