import * as Schema from "effect/Schema"

Schema.String

export class Author001 extends Schema.Opaque<Author001>()(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})) {}

export class Book001 extends Schema.Opaque<Book001>()(Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author001),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})) {}

export const decodeBook001 = Schema.decodeUnknownEffect(Book001)
export const readBook001 = (book: typeof Book001.Type) => book.author?.name ?? book.title

export class Author002 extends Schema.Opaque<Author002>()(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})) {}

export class Book002 extends Schema.Opaque<Book002>()(Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author002),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})) {}

export const decodeBook002 = Schema.decodeUnknownEffect(Book002)
export const readBook002 = (book: typeof Book002.Type) => book.author?.name ?? book.title

export class Author003 extends Schema.Opaque<Author003>()(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})) {}

export class Book003 extends Schema.Opaque<Book003>()(Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author003),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})) {}

export const decodeBook003 = Schema.decodeUnknownEffect(Book003)
export const readBook003 = (book: typeof Book003.Type) => book.author?.name ?? book.title

export class Author004 extends Schema.Opaque<Author004>()(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})) {}

export class Book004 extends Schema.Opaque<Book004>()(Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author004),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})) {}

export const decodeBook004 = Schema.decodeUnknownEffect(Book004)
export const readBook004 = (book: typeof Book004.Type) => book.author?.name ?? book.title

export class Author005 extends Schema.Opaque<Author005>()(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  born: Schema.NullOr(Schema.Number)
})) {}

export class Book005 extends Schema.Opaque<Book005>()(Schema.Struct({
  title: Schema.NullOr(Schema.String),
  isbn: Schema.String,
  pages: Schema.NullOr(Schema.Number),
  author: Schema.NullOr(Author005),
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String)))
})) {}

export const decodeBook005 = Schema.decodeUnknownEffect(Book005)
export const readBook005 = (book: typeof Book005.Type) => book.author?.name ?? book.title
