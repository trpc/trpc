it('exports StandardHandler, CompositeStandardHandlerPlugin, resolveFriendlyStandardHandlerHandleOptions, RPCMatcher, RPCHandlerCodec', async () => {
  await expect(import('.')).resolves.toMatchObject({
    StandardHandler: expect.any(Function),
    CompositeStandardHandlerPlugin: expect.any(Function),
    resolveFriendlyStandardHandlerHandleOptions: expect.any(Function),
    RPCMatcher: expect.any(Function),
    RPCHandlerCodec: expect.any(Function),
  })
})
