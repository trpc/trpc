import { IndexedDbTable, IndexedDbVersion } from "@effect/platform-browser"
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

describe("IndexedDbVersion", () => {
  it("make single table", () => {
    class Table1 extends IndexedDbTable.make({
      name: "todo1",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      }),
      keyPath: "id"
    }) {}

    class Db extends IndexedDbVersion.make(Table1) {}

    assert.equal(Db.tables.size, 1)
    assert.equal(Db.tables.get("todo1"), Table1)
  })

  it("make multiple tables", () => {
    class Table1 extends IndexedDbTable.make({
      name: "todo1",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      }),
      keyPath: "id"
    }) {}

    class Table2 extends IndexedDbTable.make({
      name: "todo2",
      schema: Schema.Struct({
        id: Schema.Number,
        title: Schema.String,
        completed: Schema.Boolean
      }),
      keyPath: "id"
    }) {}

    class Db extends IndexedDbVersion.make(Table1, Table2) {}

    assert.equal(Db.tables.size, 2)
    assert.equal(Db.tables.get("todo1"), Table1)
    assert.equal(Db.tables.get("todo2"), Table2)
  })
})
