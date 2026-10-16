import type { AnyRouter, Context, RouterClient } from '@orpc/server'
import type { Public } from '@orpc/shared'
import { RPCSerializer } from '@orpc/client'

export interface ClientServerTestOptions {
  context?: Context
  serializer?: Public<RPCSerializer>
}

export interface CreateClientServerTest {
  <T extends AnyRouter>(router: T, options?: ClientServerTestOptions): RouterClient<T>
}

export class Person {
  class = '__PERSON__'

  constructor(
    public name: string,
    public age: number,
  ) {}
}

export const defaultSerializer = new RPCSerializer({
  handlers: {
    person: {
      condition: value => value instanceof Person,
      serialize: person => ({ name: person.name, age: person.age }),
      deserialize: (data: any) => new Person(data.name, data.age),
    },
  },
})
