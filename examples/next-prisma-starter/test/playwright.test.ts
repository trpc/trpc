jest.setTimeout(35e3);

test('add todo', async () => {
  await page.goto('http://localhost:3000');

  const nonce = Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')
    .substr(0, 6);
  await page.type('.new-todo', nonce);
  await page.keyboard.press('Enter');
  await page.waitForResponse('**/trpc/**');
  await page.waitForSelector(`text=${nonce}`);
});

export {};
