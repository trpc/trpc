it('exports ArkTypeToJsonSchemaConverter', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    ArkTypeToJsonSchemaConverter: expect.any(Function),
  })
})
