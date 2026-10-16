it('exports OpenAPIReferenceHandlerPlugin', async () => {
  await expect(import('.')).resolves.toMatchObject({
    OpenAPIReferenceHandlerPlugin: expect.any(Function),
  })
})
