import * as Schema from "effect/Schema"

Schema.String

export const Author001 = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})
export interface Author001 extends Schema.Struct.Type<typeof Author001.fields> {}

export const Book001 = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author001),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})
export interface Book001 extends Schema.Struct.Type<typeof Book001.fields> {}

export const decodeBook001 = Schema.decodeUnknownEffect(Book001)
export const readBook001 = (book: typeof Book001.Type) => book.author?.name ?? book.title

export const Author002 = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})
export interface Author002 extends Schema.Struct.Type<typeof Author002.fields> {}

export const Book002 = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author002),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})
export interface Book002 extends Schema.Struct.Type<typeof Book002.fields> {}

export const decodeBook002 = Schema.decodeUnknownEffect(Book002)
export const readBook002 = (book: typeof Book002.Type) => book.author?.name ?? book.title

export const Author003 = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})
export interface Author003 extends Schema.Struct.Type<typeof Author003.fields> {}

export const Book003 = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author003),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})
export interface Book003 extends Schema.Struct.Type<typeof Book003.fields> {}

export const decodeBook003 = Schema.decodeUnknownEffect(Book003)
export const readBook003 = (book: typeof Book003.Type) => book.author?.name ?? book.title

export const Author004 = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})
export interface Author004 extends Schema.Struct.Type<typeof Author004.fields> {}

export const Book004 = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author004),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})
export interface Book004 extends Schema.Struct.Type<typeof Book004.fields> {}

export const decodeBook004 = Schema.decodeUnknownEffect(Book004)
export const readBook004 = (book: typeof Book004.Type) => book.author?.name ?? book.title

export const Author005 = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})
export interface Author005 extends Schema.Struct.Type<typeof Author005.fields> {}

export const Book005 = Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author005),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})
export interface Book005 extends Schema.Struct.Type<typeof Book005.fields> {}

export const decodeBook005 = Schema.decodeUnknownEffect(Book005)
export const readBook005 = (book: typeof Book005.Type) => book.author?.name ?? book.title
