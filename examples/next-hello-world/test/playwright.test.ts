test('loads data from trpc', async () => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=hello world`);
  await page.waitForSelector(`text=hello client`);
});
export {};
