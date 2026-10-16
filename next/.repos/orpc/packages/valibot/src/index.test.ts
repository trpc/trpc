it('exports ValibotToJsonSchemaConverter', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    ValibotToJsonSchemaConverter: expect.any(Function),
  })
})
