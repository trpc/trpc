jest.setTimeout(35e3);

test('go to /', async () => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=Starter`);
});

export {};
