import { serverConfig } from '../config';
import { createClient } from './client';

async function start() {
  const { port, prefix } = serverConfig;
  const anon = createClient({ port, prefix });
  const auth = createClient({
    port,
    prefix,
    headers: { username: 'nyan' },
  });

  const getHello = await fetch(`http://localhost:${port}/hello`);
  const getHelloJSON = await getHello.json();

  console.log('>>> fetch:get:hello:', getHelloJSON);

  const postHello = await fetch(`http://localhost:${port}/hello`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: 'life', life: 42 }),
  });

  const postHelloJSON = await postHello.json();
  console.log('>>> fetch:post:hello:', postHelloJSON);

  const version = await anon.client.query('version');
  console.log('>>> anon:version:', version);

  const anonHello = await anon.client.query('hello');
  console.log('>>> anon:hello:', anonHello);

  const authHello = await auth.client.query('hello');
  console.log('>>> auth:hello:', authHello);

  const helloWithInput = await anon.client.query('hello', { username: 'you' });
  console.log('>>> anon:hello(with input):', helloWithInput);

  try {
    // Should fail
    const anonPost = await anon.client.mutation('posts:create', {
      title: '1337',
    });
    console.log('>>> anon:posts:create:success:', anonPost);
  } catch (error) {
    console.log('>>> anon:posts:create:error:', (error as Error).message);
  }

  try {
    // Should work
    const authPost = await auth.client.mutation('posts:create', {
      title: 'My first post',
    });
    console.log('>>> auth:posts:create:success:', authPost);
  } catch (error) {
    console.log('>>> auth:posts:create:error:', (error as Error).message);
  }

  const anonPostsList = await anon.client.query('posts:list');
  console.log('>>> anon:posts:list:', anonPostsList);

  await anon.client.query('posts:reset');

  let randomNumberCount = 0;

  await new Promise<void>((resolve) => {
    const sub = anon.client.subscription('sub:randomNumber', undefined, {
      onData(data) {
        console.log('>>> anon:sub:randomNumber:received:', data);
        randomNumberCount++;

        if (randomNumberCount > 3) {
          sub.unsubscribe();
          resolve();
        }
      },
      onError(error) {
        console.error('>>> anon:sub:randomNumber:error:', error);
      },
      onComplete() {
        console.log('>>> anon:sub:randomNumber:', 'unsub() called');
      },
    });
  });

  // we're done - make sure app closes with a clean exit
  anon.wsClient.close();
  auth.wsClient.close();
}

start();

// Should outputs something like:
// >>> anon:version: { version: '0.42.0' }
// >>> anon:hello: { text: 'hello anonymous' }
// >>> auth:hello: { text: 'hello nyan' }
// >>> anon:hello(with input): { text: 'hello you' }
// >>> anon:posts:create:error: UNAUTHORIZED
// >>> auth:posts:create:success: { id: 1, title: 'My first post' }
// >>> anon:posts:list: [ { id: 1, title: 'My first post' } ]
// >>> anon:sub:randomNumber:received: { type: 'started' }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.4002197581455267 } }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.7066840380142223 } }
// >>> anon:sub:randomNumber:received: { type: 'data', data: { randomNumber: 0.20896433661111224 } }
// >>> anon:sub:randomNumber: unsub() called
