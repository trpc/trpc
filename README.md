<div align="center">
  <h1 align="center">ZodRPC</h1>
</div>

<!-- Place this tag where you want the button to render. -->

<!-- Created by [@vriad](https://twitter.com/vriad), maintained by  -->

### Table of contents

# Motivation

ZodRPC is a toolkit for creating typesafe backends powered by [Zod](https://github.com/vriad/zod).

<!-- If you think static typing isn't worth the trouble, or you're unfamiliar with type safely in general, I encourage you to read on. I think you'll be surprised how convenient and delightful it can be to develop an application with strong, static typing from end to end.

If you're a TypeScript fan, strap in because you're going to love this. -->
<!--
The fundamental complexity of backend development is transferring and transforming data as it passes between your database, your ORM, your API endpoints, your caching layer, and the client. It's your job to write code to ensure that the data is in the proper shape at each step along the way.

Usually, you end up with a codebase that's a rat's nest of duct tape and type validators. These type validators may be explicitly defined (using tools like Joi, Yup, or Zod), implicitly defined (the return type of SQL query), or composed entirely of hopes and prayers (if you don't use TypeScript!).

That's where zod-rpc comes in. zod-rpc makes it easy to define and enforce the shape of your data as it passes through the layers of your application.

But we'll get to that. Let's start with some basics.

# Installation

```ts
yarn add zodrpc
```

```ts
npm install --save zodrpc
```

# Basic usage

## Primitives

```ts
const stringSchema = zodrpc.string();
const numberSchema = zodrpc.number();
const booleanSchema = zodrpc.boolean();
const bigintSchema = zodrpc.bigint();
const dateSchema = zodrpc.date();
```

The core of zod-rpc is a validation library, similar to Yup, Joi, or io-ts. If you've never heard of any of these, don't worry, no prior experience is required.

Let's create a simple schema that validates strings.

```ts
import zodrpc from 'zodrpc';

const stringSchema = zodrpc.string();
```

Every zod-rpc schema has certain methods.

### Parsing

We can use the `.parse` method to check a value against the schema type.

```ts
stringSchema.parse('asdf'); // => return "asdf"
stringSchema.parse(12); // => TypeError
```

### Type inference

You can infer the TypeScript type of any schema like so:

```ts
const A = z.string();
type A = z.infer<typeof A>; // string
```

### Optional

We can make schemas `optional` like so:

```ts
const stringOrUndefined = stringSchema.optional(); // returns a
stringOrUndefined.parse(undefined); // => passes, returns undefined

type t = z.infer<typeof stringOrUndefined>;
// string | undefined
```

### Nullable

Similarly, we can make a schema nullable like so:

```ts
const stringOrNull = stringSchema.nullable();
stringOrUndefined.parse(null); // => passes, returns null

type t = z.infer<typeof stringOrUndefined>;
// string | null
```

### Immutability

zod-rpc schemas are immutable! All methods return a new schema instance.

`.parse`, `.optional`, and `.nullable` are available on _any_ zod-rpc schema.


### Enums

```ts
const breed = zodrpc.string().oneOf('lab', 'schnauzer', 'beagle');
// zod-rpcType<"lab" | "schnauzer" | "beagle">
```

### Arrays

### Objects

- merge
- augment
- pick
- omit
- partial
-

# Example

#### 1. Define your data models in zod-rpc

```ts
import zodrpc from 'zodrpc';

const User = zodrpc.model({
  name: 'User',
  fields: {
    id: zodrpc.id(),
    firstName: zodrpc.field(zodrpc.string(), {
      label: 'First name',
    }),
  },
});
```

#### 2. Spec your API

```ts
const app = zodrpc.rest({
  contextType: zodrpc.object({
    token: zodrpc.string(),
  }),
  context(req, res) {
    // if the return type doesn't match contextType
    // a 400 error is sent
    return { token: zodrpc.string().parse(req.headers['Authorization']) };
  },
});

// familiar Express-like API
app
  .patch((ctx) => {
    return {
      path: zodrpc.path().push('user').param('id',zodrpc.string()),
      body: schema.models.User.partial(), // validator for request body
      returns: schema.models.User.fields() // strip all relations
      authorize: (ctx) => {
        const token = ctx.token;
        // run authorization check
        return true;
      },
    };
  })
  .implement(({ query, body, req, res, next, ctx }) => {
    req.body; // any
    req.query; // any
    query; // { id: string }
    body; // => { firstName: string }

    const updatedUser = ctx.orm.updateUser(body) // update user here
    return updatedUser;
  });

app.serve(3000);
```

This is an example for implementing a REST API but zod-rpc has built-in modules to define REST, RPC, and GraphQL APIs in a totally typesafe way.

#### 3. Generate a TypeScript client SDK from your API

```ts
// ./server/app.ts
app.export.toSDK({
  path: `${__dirname}/../client/sdk.ts`,
});

// ./client/index.ts
import SDK from './sdk';

const setFirstName = async (firstName: string) => {
  const updatedUser = await SDK.user.id('ID_HERE').patch({ firstName });
  updatedUser; // { id: string, firstName: string };
};
```

# Installation

```
yarn add zodrpc

npm install zodrpc --save
```

# Concepts

## Schema definitions vs API definitions

Moving forward, it is vital that you understand the difference between "model definitions" and "API definitions". GraphQL users tend to be acutely aware of this distinction, but if you have a background implementing traditional SQL-backed REST APIs it may be confusing initially.

Model definitions define the data types _that will be stored in your database_.

API definitions define the data types that are _accepted or returned by the API consumed by the client_.

If you've ever created an ORM model, that would be classified as a "schema definition" since ORMs provide helper functions for writing to your database. On the other hand, GraphQL definitions are "API definitions" since they define what data your clients can read or write to the database.

In zod-rpc you define your models first. Then you create API endpoints using your models as a basis. What this means exactly will become clear as you read through these docs.

# Usage

### Import

```ts
import zod-rpc from 'zodrpc';
```

### Create a zod-rpc instance

You create an "instance" of zodrpc with the `zod-rpcFactory` method.

```ts
import zod-rpc from 'zodrpc';

export const s = zod-rpc.create();
```

### Create model definitions

You can use the zod-rpc instance to define data util.

```ts
const Player = s.model({
  define() {
    return {
      id: s.id(),
      email: s.string().required(),
      points: s.int(),
    };
  },
});
```

You can use the following methods to define the properties of a model

```ts
// for primary keys
s.id();

// primitive types
s.string();
s.int();
s.float();
s.boolean();

// arrays of primitive types
s.array.string();
s.array.float();
s.array.int();
s.array.boolean();
```

With the exception of `s.id()` (which is always considered `required`), you can append `.required()` to any of these to make it a required field.

With the exception of `s.id()` (which is always considered `unique`), you can append `.unique()` to any property to enforce uniqueness.

### Relations

Use `s.toOne` and `s.toMany` to create relations between models.

```ts
const Guild = s.model({
  define() {
    return {
      id: s.id(),
      name: s.string().required(),
      createdBy: s.toOne(Player),
      players: s.toMany(Player),
    };
  },
});
```

### Recursive relations

To create recursive relations without getting TypeScript errors, you have to _explicitly type_ your models.

```ts
interface Player {
  id: string;
  email: string;
  points?: number;
}

const Player: s.model<Player> = s.model({
  define() {
    return {
      id: s.id(),
      email: s.string().required(),
      points: s.int(),
      guild: s.toOne(Guild), // adding this creates a cycle
    };
  },
});

interface Guild {
  id: string;
  name: string;
  createdBy: Player;
  members: Player[];
}

const Guild: s.model<Guild> = s.model({
  define() {
    return {
      id: s.id(),
      name: s.string().required(),
      createdBy: s.toOne(Player),
      players: s.toMany(Player),
    };
  },
});
```

### Validation checks

Currently zod-rpc doesn't support validation checks beyond verifying basic types (string, float, etc). We plan to incorporate more advanced validation (e.g. number min/max, string length, regex support, `isEmail`, `isURL`, etc) in a future release.

# Configuration

```ts
import zod-rpc from "zodrpc";


const s = zod-rpc.create<{}>
```

For all but the simplest cases, you'll want to configure your zod-rpc instance by passing a type the

You are able to configure various options by passing a TypeScript type into the generic `zod-rpcFactory` function, like so:

```ts
const s =
  zod -
  rpcFactory<{
    context: { userId: string; token: string };
  }>();
```

### Define schema definitions

You define your data types with `zodrpc.model`.

```ts
const User = zodrpc.model({
  define(){
    return {
      firstName: s.string().required().authorize(())
    }
  }
})
``` -->
