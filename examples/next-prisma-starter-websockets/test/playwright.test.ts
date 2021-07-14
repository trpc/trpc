jest.setTimeout(35e3);

test('send message', async () => {
  await new Promise((resolve) => setTimeout(resolve, 1e3));
  await page.goto('http://localhost:3000');

  const viewer = await browser.newPage();
  await viewer.goto('http://localhost:3000');

  const nonce = Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')
    .substr(0, 6);
  await page.type('[name=name]', nonce);
  await page.click('[type=submit]');
  await page.type('[name=text]', nonce);
  await page.click('[type=submit]');

  await viewer.waitForSelector(`text=${nonce}`);
  viewer.close();
});

export {};
