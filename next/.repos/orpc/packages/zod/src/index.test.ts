it('exports ZodToJsonSchemaConverter', async () => {
  await expect(import('.')).resolves.toMatchObject({
    ZodToJsonSchemaConverter: expect.any(Function),
  })
})
