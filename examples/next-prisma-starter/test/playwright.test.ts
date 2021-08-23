jest.setTimeout(35e3);

test('go to /', async () => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=Starter`);
});

test('test 404', async () => {
  const res = await page.goto('http://localhost:3000/post/not-found');
  expect(res?.status()).toBe(404);
});

export {};
