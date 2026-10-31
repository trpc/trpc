## Typed GraphQL clients with `effect/graphql`

Use the `effect/graphql` modules to call GraphQL APIs with typed
operations. Run `graphqlgen` from `@effect/graphql-generator` to generate
operations from `.graphql` documents, then build a client with
`GraphQLClient.make` and provide a transport from `GraphQLProtocol`.
