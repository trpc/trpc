it('exports OpenAPIHandler', async () => {
  await expect(import('.')).resolves.toMatchObject({
    OpenAPIHandler: expect.any(Function),
  })
})
