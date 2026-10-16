it('exports useServerFunction and useOptimisticServerFunction', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    useServerFunction: expect.any(Function),
    useOptimisticServerFunction: expect.any(Function),
  })
})
