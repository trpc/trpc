it('exports StandardLink, RPCLinkCodec', async () => {
  await expect(import('.')).resolves.toMatchObject({
    StandardLink: expect.any(Function),
    RPCLinkCodec: expect.any(Function),
  })
})
