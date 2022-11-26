import { client } from './client';

async function main() {
  {
    const result = await client.serverA.greet.query('tRPC');

    console.log(result.greeting.toUpperCase());
  }
  {
    const result = await client.serverB.foo.query();

    console.log(result.toUpperCase());
  }
}

main();
