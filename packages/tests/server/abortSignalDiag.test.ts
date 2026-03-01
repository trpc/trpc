import { test, expect } from 'vitest';

test('AbortController diagnosis in jsdom environment', async () => {
  console.log('AbortController.name:', AbortController.name);
  console.log('AbortSignal.name:', AbortSignal.name);
  
  const ac = new AbortController();
  console.log('signal constructor:', ac.signal.constructor.name);
  console.log('signal instanceof AbortSignal:', ac.signal instanceof AbortSignal);
  
  // Try fetch with the signal
  try {
    await fetch('http://localhost:9876', { signal: ac.signal });
  } catch(e: any) {
    console.log('fetch error:', e.message.slice(0, 100));
  }
  
  expect(true).toBe(true);
});
