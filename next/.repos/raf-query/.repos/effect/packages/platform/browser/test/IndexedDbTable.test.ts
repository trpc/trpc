import { IndexedDb, IndexedDbTable } from "@effect/platform-browser"
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

describe("IndexedDbTable", () => {
  it("make", () => {
    class Table extends IndexedDbTable.make({
      name: "todo",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      }),
      keyPath: "id"
    }) {}

    assert.equal(Table.tableName, "todo")
    assert.equal(Table.autoIncrement, false)
    assert.deepStrictEqual(Table.tableSchema.fields.id, Schema.Number)
    assert.deepStrictEqual(Table.tableSchema.fields.title, Schema.String)
    assert.deepStrictEqual(Table.tableSchema.fields.completed, Schema.Boolean)
    assert.equal(Table.keyPath, "id")
  })

  it("autoIncrement", () => {
    class Table1 extends IndexedDbTable.make({
      name: "todo",
      schema: Schema.Struct({
        id: IndexedDb.AutoIncrement,
        title: Schema.String
      }),
      keyPath: "id",
      autoIncrement: true
    }) {}

    class Table2 extends IndexedDbTable.make({
      name: "todo",
      schema: Schema.Struct({
        id: IndexedDb.AutoIncrement,
        title: Schema.String
      }),
      keyPath: "id",
      autoIncrement: false
    }) {}

    assert.equal(Table1.tableName, "todo")
    assert.equal(Table1.autoIncrement, true)
    assert.deepStrictEqual(
      Table1.tableSchema.fields.id,
      IndexedDb.AutoIncrement
    )
    assert.deepStrictEqual(Table1.tableSchema.fields.title, Schema.String)
    assert.equal(Table1.keyPath, "id")

    assert.equal(Table2.tableName, "todo")
    assert.equal(Table2.autoIncrement, false)
    assert.deepStrictEqual(
      Table2.tableSchema.fields.id,
      IndexedDb.AutoIncrement
    )
    assert.deepStrictEqual(Table2.tableSchema.fields.title, Schema.String)
    assert.equal(Table2.keyPath, "id")
  })

  it("multiple keyPath", () => {
    const Table = IndexedDbTable.make({
      name: "todo",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      }),
      keyPath: ["id", "title"]
    })

    assert.equal(Table.tableName, "todo")
    assert.equal(Table.autoIncrement, false)
    assert.deepStrictEqual(Table.tableSchema.fields.id, Schema.Number)
    assert.deepStrictEqual(Table.tableSchema.fields.title, Schema.String)
    assert.deepStrictEqual(Table.tableSchema.fields.completed, Schema.Boolean)
    assert.deepStrictEqual(Table.keyPath, ["id", "title"])
  })

  it("no keyPath", () => {
    const Table = IndexedDbTable.make({
      name: "todo",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      })
    })

    assert.equal(Table.tableName, "todo")
    assert.equal(Table.autoIncrement, false)
    assert.deepStrictEqual(Table.tableSchema.fields.id, Schema.Number)
    assert.deepStrictEqual(Table.tableSchema.fields.title, Schema.String)
    assert.deepStrictEqual(Table.tableSchema.fields.completed, Schema.Boolean)
    assert.deepStrictEqual(Table.keyPath, undefined)
  })
})
