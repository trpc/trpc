it('exports createSWRUtils, SWR_OPERATION_CONTEXT_SYMBOL', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    createSWRUtils: expect.any(Function),
    createRouterUtils: expect.any(Function),
    generateOperationKey: expect.any(Function),
    isSubsetOf: expect.any(Function),
    SWR_OPERATION_CONTEXT_SYMBOL: expect.any(Symbol),
  })
})
