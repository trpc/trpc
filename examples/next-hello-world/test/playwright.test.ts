import { Browser, chromium, Page } from 'playwright';
let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage();
});
afterEach(async () => {
  await page.close();
});

test('loads data from trpc', async () => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector(`text=hello world`);
  await page.waitForSelector(`text=hello client`);
});
