it('exports createTanstackQueryUtils, TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    createTanstackQueryUtils: expect.any(Function),
    TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL: expect.any(Symbol),
  })
})
