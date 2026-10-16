it('exports encodeHibernationRPCEvent, HibernationHandlerPlugin', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    encodeHibernationRPCEvent: expect.any(Function),
    HibernationHandlerPlugin: expect.any(Function),
  })
})
