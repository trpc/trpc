import { createClient } from './client';
import { serverConfig } from '../config';

async function start() {
  const { port, prefix } = serverConfig;
  const { client: anon } = createClient({ port, prefix });
  const { client: auth } = createClient({
    port,
    prefix,
    headers: { username: 'nyan' },
  });

  const version = await anon.query('version');
  console.log('>>> anon:version:', version);

  const anonHello = await anon.query('hello');
  console.log('>>> anon:hello:', anonHello);

  const authHello = await auth.query('hello');
  console.log('>>> auth:hello:', authHello);

  const helloWithInput = await anon.query('hello', { username: 'you' });
  console.log('>>> anon:hello(with input):', helloWithInput);

  try {
    // Should fail
    const anonPost = await anon.mutation('posts:create', {
      title: '1337',
    });
    console.log('>>> anon:posts:create:success:', anonPost);
  } catch (error) {
    console.log('>>> anon:posts:create:error:', (error as Error).message);
  }

  try {
    // Should work
    const authPost = await auth.mutation('posts:create', {
      title: 'My first post',
    });
    console.log('>>> auth:posts:create:success:', authPost);
  } catch (error) {
    console.log('>>> auth:posts:create:error:', (error as Error).message);
  }

  const anonPostsList = await anon.query('posts:list');
  console.log('>>> anon:posts:list:', anonPostsList);

  await anon.query('posts:reset');

  let randomNumberCount = 0;

  const unsub = anon.subscription('sub:randomNumber', null, {
    onNext(data) {
      console.log('>>> anon:sub:randomNumber:received:', data);
      randomNumberCount++;

      if (randomNumberCount > 3) {
        unsub();
      }
    },
    onError(error) {
      console.error('>>> anon:sub:randomNumber:error:', error);
    },
    onDone() {
      console.log('>>> anon:sub:randomNumber:', 'unsub() called');
    },
  });
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
