it('exports RPCHandler', async () => {
  await expect(import('.')).resolves.toHaveProperty('experimental_RPCHandler')
})
