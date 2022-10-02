# prisma-transformer

Starting up postgres containers in CI takes a lot of time.

This action transforms your prisma schema to use sqlite for CI.

## What it does

- [x] Replaces the datasource provider with `sqlite`
- [x] Sets the `url` to `file:./dev.db`
- [x] Replaces all `enum` instances with `String`
- [ ] More?

## Example

The following schema:

```prisma
datasource db {
    provider = "postgres"
    url      = env("DATABASE_URL")
}

enum Role {
    ADMIN
    USER
}

model Example {
    id   String @id @default(cuid())
    name String
    role Role
}
```

will be transformed to:

```prisma
datasource db {
provider = "sqlite"
url = "file:./dev.db"
}
// enum Role {
// ADMIN
// USER
// }
model Example {
id String @id @default(cuid())
name String
role String
}
```

