test('loads data from trpc', async () => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=An example entry`);
});

test('ssr', async () => {
  await browser.newPage({
    javaScriptEnabled: false,
  });
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=An example entry`);
});
export {};
