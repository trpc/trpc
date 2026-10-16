it('exports RPCLink', async () => {
  await expect(import('.')).resolves.toHaveProperty('RPCLink')
})
