it('exports createHTTPUtils', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    createHTTPUtils: expect.any(Function),
  })
})
