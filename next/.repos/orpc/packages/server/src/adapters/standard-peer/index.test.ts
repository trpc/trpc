it('exports createStandardPeerRequestHandler', async () => {
  await expect(import('.')).resolves.toHaveProperty('createStandardPeerRequestHandler')
})
