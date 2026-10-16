it('exports plugin and middleware factory', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    RateLimitHandlerPlugin: expect.any(Function),
    ratelimit: expect.any(Function),
  })
})
