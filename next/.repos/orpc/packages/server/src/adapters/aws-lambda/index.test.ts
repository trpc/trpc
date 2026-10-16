it('exports RPCHandler', async () => {
  await expect(import('.')).resolves.toMatchObject({
    RPCHandler: expect.any(Function),
  })
})
