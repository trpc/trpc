it('exports os, ORPCError, createRouterClient, RPCJsonSerializer, RPCSerializer', async () => {
  await expect(import('.')).resolves.toMatchObject({
    os: expect.any(Object),
    ORPCError: expect.any(Function),
    createRouterClient: expect.any(Function),
    RPCJsonSerializer: expect.any(Function),
    RPCSerializer: expect.any(Function),
  })
})
