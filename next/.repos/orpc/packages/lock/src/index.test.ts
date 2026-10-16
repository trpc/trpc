it('exports middleware factory and error', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    lock: expect.any(Function),
    LockTimeoutError: expect.any(Function),
  })
})
