it('exports createORPCClient, ORPCError, DynamicLink, RPCJsonSerializer, RPCSerializer', async () => {
  await expect(import('./index')).resolves.toEqual(expect.objectContaining({
    createORPCClient: expect.any(Function),
    ORPCError: expect.any(Function),
    DynamicLink: expect.any(Function),
    RPCJsonSerializer: expect.any(Function),
    RPCSerializer: expect.any(Function),
  }))
})
