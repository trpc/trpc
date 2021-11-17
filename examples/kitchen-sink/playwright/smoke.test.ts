jest.setTimeout(35e3);

test('all pages load', async () => {
  const visited = new Set<string>();
  async function crawl(url: string) {
    console.log('visiting ' + url);
    if (visited.has(url)) {
      console.log('- skipped', url);
      return;
    }
    visited.add(url);

    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    const baseUrl = page.url();

    const $links = await page.$$('a');
    const hrefs = await Promise.all(
      $links.map(($link) => $link.getAttribute('href')),
    );
    for (const href of hrefs) {
      if (!href) {
        continue;
      }
      if (href.includes('://')) {
        console.log('- skipped', href);
        continue;
      }
      if (href.startsWith('/')) {
        await crawl('http://localhost:3000' + href);
      } else {
        await crawl(baseUrl + href);
      }
    }
  }
  await crawl('http://localhost:3000');
});

export {};
