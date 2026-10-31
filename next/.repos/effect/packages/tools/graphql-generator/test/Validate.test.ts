import * as Validate from "@effect/graphql-generator/internal/Validate"
import { assert, describe, it } from "@effect/vitest"
import { parseOrThrow, source } from "./utils/ast.ts"
import { readSdl } from "./utils/model.ts"

const schema = readSdl(`
interface Node { id: ID! }
interface Orphan { id: ID! }
type User implements Node { id: ID! name: String! friends(first: Int!): [User!]! }
type Dog implements Node { id: ID! }
type Query { user(id: ID!): User orphan: Orphan }
`)

const validateWith = (schema: ReturnType<typeof readSdl>) => (files: Record<string, string>): ReadonlyArray<string> =>
  Validate.validate(
    schema,
    Object.entries(files).map(([path, body]) => ({ source: source(body, path), document: parseOrThrow(body, path) }))
  ).map(({ column, line, message, path }) => `${path}:${line}:${column} ${message}`)

const validate = validateWith(schema)

describe("Validate", () => {
  it("fields exist on their parent type", () => {
    assert.deepStrictEqual(validate({ "q.graphql": "query Q { user(id: \"1\") { homepage } }" }), [
      "q.graphql:1:27 Cannot query field \"homepage\" on type \"User\"."
    ])
  })

  it("arguments exist and required arguments are provided", () => {
    assert.deepStrictEqual(
      validate({ "q.graphql": "query Q { user(id: \"1\", locale: \"en\") { friends { id } } }" }),
      [
        "q.graphql:1:25 Unknown argument \"locale\" on field \"Query.user\".",
        "q.graphql:1:41 Field \"friends\" argument \"first\" of type \"Int!\" is required, but it was not provided."
      ]
    )
  })

  it("variables are defined, used and of input types", () => {
    assert.deepStrictEqual(
      validate({ "q.graphql": "query Q($unused: ID, $u: User) { user(id: $u) { friends(first: $n) { id } } }" }),
      [
        "q.graphql:1:9 Variable \"$unused\" is never used in operation \"Q\".",
        "q.graphql:1:26 Variable \"$u\" cannot be non-input type \"User\".",
        "q.graphql:1:64 Variable \"$n\" is not defined by operation \"Q\"."
      ]
    )
  })

  it("fragments are defined and used", () => {
    assert.deepStrictEqual(
      validate({ "q.graphql": "query Q { user(id: \"1\") { ...Missing } } fragment Unused on User { id }" }),
      [
        "q.graphql:1:30 Unknown fragment \"Missing\".",
        "q.graphql:1:42 Fragment \"Unused\" is never used."
      ]
    )
  })

  it("fragments are spread onto a possible type", () => {
    assert.deepStrictEqual(validate({ "q.graphql": "query Q { user(id: \"1\") { ... on Dog { id } } }" }), [
      "q.graphql:1:27 Fragment cannot be spread here as objects of type \"User\" can never be of type \"Dog\"."
    ])
  })

  it("a composite type overlaps itself, even with no possible types", () => {
    assert.deepStrictEqual(
      validate({
        "q.graphql": "query Q { orphan { ... on Orphan { id } ...OrphanId } } fragment OrphanId on Orphan { id }"
      }),
      []
    )
  })

  it("operations are named and operation names are unique", () => {
    assert.deepStrictEqual(
      validate({ "q.graphql": "{ orphan { id } } query Q { orphan { id } } query Q { orphan { id } }" }),
      [
        "q.graphql:1:1 Anonymous operations are not supported, name this operation.",
        "q.graphql:1:25 There can be only one operation named \"Q\".",
        "q.graphql:1:51 There can be only one operation named \"Q\"."
      ]
    )
  })

  it("operations and fragments share one name namespace across files", () => {
    assert.deepStrictEqual(
      validate({
        "a.graphql": "query A { user(id: \"1\") { ...Friends } } fragment Friends on User { id }",
        "b.graphql": "query Friends { orphan { id } }"
      }),
      [
        "a.graphql:1:51 There can be only one operation or fragment named \"Friends\".",
        "b.graphql:1:7 There can be only one operation or fragment named \"Friends\"."
      ]
    )
  })

  it("leaf fields have no selection set and composite fields have one", () => {
    assert.deepStrictEqual(
      validate({ "q.graphql": "query Q { user(id: \"1\") { id { name } friends(first: 1) } }" }),
      [
        "q.graphql:1:30 Field \"id\" must not have a selection since type \"ID!\" has no subfields.",
        "q.graphql:1:39 Field \"friends\" of type \"[User!]!\" must have a selection of subfields. Did you mean \"friends { ... }\"?"
      ]
    )
  })

  it("fields sharing a response key are the same field with the same arguments", () => {
    assert.deepStrictEqual(
      validate({
        "q.graphql": "query Q { user(id: \"1\") { name: id name friends(first: 1) { id } friends(first: 2) { id } } }"
      }),
      [
        "q.graphql:1:36 Fields \"name\" conflict because \"id\" and \"name\" are different fields. Use different aliases on the fields to fetch both if this was intentional.",
        "q.graphql:1:66 Fields \"friends\" conflict because they have differing arguments. Use different aliases on the fields to fetch both if this was intentional."
      ]
    )
  })

  it("fragments and the variables they use resolve across files", () => {
    assert.deepStrictEqual(
      validate({
        "viewer.graphql": "query Viewer($id: ID!) { ...ViewerUser }",
        "fragments.graphql": "fragment ViewerUser on Query { user(id: $id) { name } }"
      }),
      []
    )
  })

  it("a diagnostic is reported in the file holding the offending node", () => {
    assert.deepStrictEqual(
      validate({
        "viewer.graphql": "query Viewer { user(id: \"1\") { ...A } ...ViewerUser } fragment B on User { ...A }",
        "fragments.graphql": "fragment ViewerUser on Query { user(id: $id) { id } } fragment A on User { ...B }"
      }),
      [
        "viewer.graphql:1:76 Cannot spread fragment \"B\" within itself via \"A\".",
        "fragments.graphql:1:32 Fields \"user\" conflict because they have differing arguments. Use different aliases on the fields to fetch both if this was intentional.",
        "fragments.graphql:1:41 Variable \"$id\" is not defined by operation \"Viewer\"."
      ]
    )
  })
})

const validateValues = validateWith(readSdl(`
scalar Date
interface Node { id: ID! }
type User implements Node { id: ID! name: String! email: String friends(first: Int!): [User!]! }
type Dog implements Node { id: ID! name: String }
enum Role { ADMIN USER }
input UserInput { name: String! role: Role }
input By @oneOf { id: ID name: String }
type Query {
  user(id: ID!): User
  node(id: ID!): Node
  users(first: Int, role: Role): [User!]
  find(by: By!): User
  at(date: Date): Int
}
type Mutation { createUser(input: UserInput!): User }
`))

describe("Validate: positions, merging, directives and values", () => {
  it("a variable is used only where its type is allowed; a default lets a nullable variable fill a non-null position", () => {
    assert.deepStrictEqual(
      validateValues({
        "q.graphql": [
          `query A($id: ID) { user(id: $id) { id } }`,
          `query B($b: Boolean) { user(id: "1") { name @include(if: $b) } }`,
          `query C($id: ID = "1") { user(id: $id) { id } }`
        ].join("\n")
      }),
      [
        `q.graphql:1:29 Variable "$id" of type "ID" used in position expecting type "ID!".`,
        `q.graphql:2:58 Variable "$b" of type "Boolean" used in position expecting type "Boolean!".`
      ]
    )
  })

  it("a subscription selects exactly one root field", () => {
    const validateSubscriptions = validateWith(readSdl(`type Query { a: Int } type Subscription { x: Int y: Int }`))
    assert.deepStrictEqual(validateSubscriptions({ "q.graphql": `subscription S { x y }` }), [
      `q.graphql:1:20 Subscription "S" must select only one top level field.`
    ])
  })

  it("a variable in a literal coerced to a list is checked against the list's item type, through nested lists", () => {
    const validateLists = validateWith(
      readSdl(`input I { id: ID! } type Query { many(inputs: [I!]!): Int nested(inputs: [[I!]]): Int }`)
    )
    assert.deepStrictEqual(
      validateLists({
        "q.graphql": [
          `query Q($id: ID) { many(inputs: { id: $id }) }`,
          `query R($id: ID) { nested(inputs: { id: $id }) }`
        ].join("\n")
      }),
      [
        `q.graphql:1:39 Variable "$id" of type "ID" used in position expecting type "ID!".`,
        `q.graphql:2:41 Variable "$id" of type "ID" used in position expecting type "ID!".`
      ]
    )
  })

  it("fields sharing a response key are compared through fragments, inline fragments and subselections", () => {
    assert.deepStrictEqual(
      validateValues({
        "q.graphql": [
          `query Q { user(id: "1") { ...A ...B } }`,
          `fragment A on User { x: name }`,
          `fragment B on User { x: email }`,
          `query R { user(id: "1") { friends(first: 1) { a: name } friends(first: 1) { a: email } } }`,
          `query S { node(id: "1") { ... on User { v: name } ... on Dog { v: name } } }`,
          `query T { node(id: "1") { ... on User { v: id } ... on Dog { v: id } } }`
        ].join("\n")
      }),
      [
        `q.graphql:3:22 Fields "x" conflict because "name" and "email" are different fields. Use different aliases on the fields to fetch both if this was intentional.`,
        `q.graphql:4:57 Fields "friends" conflict because subfields "a" conflict because "name" and "email" are different fields. Use different aliases on the fields to fetch both if this was intentional.`,
        `q.graphql:5:64 Fields "v" conflict because they return conflicting types "String!" and "String". Use different aliases on the fields to fetch both if this was intentional.`
      ]
    )
  })

  it("@skip and @include need an if: Boolean!, appear once per location and only on fields and fragments; other directives are tolerated", () => {
    assert.deepStrictEqual(
      validateValues({
        "q.graphql": [
          `query Q($s: String!) { user(id: "1") { a: name @include b: email @skip(if: $s) c: id @skip(if: false) @skip(if: true) d: name @cached } }`,
          `query R @skip(if: false) { user(id: "1") { name } }`
        ].join("\n")
      }),
      [
        `q.graphql:1:48 Directive "@include" argument "if" of type "Boolean!" is required, but it was not provided.`,
        `q.graphql:1:76 Variable "$s" of type "String!" used in position expecting type "Boolean!".`,
        `q.graphql:1:103 The directive "@skip" can only be used once at this location.`,
        `q.graphql:2:9 Directive "@skip" may not be used on QUERY.`
      ]
    )
  })

  it("literal arguments and variable defaults match their input types; custom scalars take any literal and ID takes an Int", () => {
    assert.deepStrictEqual(
      validateValues({
        "q.graphql": [
          `query Q($r: Role = "ADMIN") {`,
          `  a: users(first: 1.5) { id }`,
          `  b: users(role: SUPER) { id }`,
          `  c: user(id: null) { id }`,
          `  d: find(by: { id: "1", name: "x" }) { id }`,
          `  e: user(id: 1) { id }`,
          `  f: at(date: "2026-10-12")`,
          `  g: users(role: $r) { id }`,
          `}`,
          `mutation M {`,
          `  a: createUser(input: { role: ADMIN }) { id }`,
          `  b: createUser(input: { name: "a", bogus: 1 }) { id }`,
          `}`
        ].join("\n")
      }),
      [
        `q.graphql:1:20 Enum "Role" cannot represent non-enum value: "ADMIN".`,
        `q.graphql:2:19 Int cannot represent non-integer value: 1.5`,
        `q.graphql:3:18 Value "SUPER" does not exist in "Role" enum.`,
        `q.graphql:4:15 Expected value of type "ID!", found null.`,
        `q.graphql:5:15 OneOf Input Object "By" must specify exactly one key.`,
        `q.graphql:11:24 Field "UserInput.name" of required type "String!" was not provided.`,
        `q.graphql:12:37 Field "bogus" is not defined by type "UserInput".`
      ]
    )
  })

  it("variable, argument and input field names are unique", () => {
    assert.deepStrictEqual(
      validateValues({
        "q.graphql": [
          `query Q($a: ID!, $a: ID!) { user(id: $a, id: "2") { id } }`,
          `mutation M { createUser(input: { name: "a", name: "b" }) { id } }`
        ].join("\n")
      }),
      [
        `q.graphql:1:18 There can be only one variable named "$a".`,
        `q.graphql:1:42 There can be only one argument named "id".`,
        `q.graphql:2:45 There can be only one input field named "name".`
      ]
    )
  })
})
