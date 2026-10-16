it('exports RequestValidationLinkPlugin, ResponseValidationLinkPlugin', async () => {
  await expect(import('.')).resolves.toMatchObject({
    RequestValidationLinkPlugin: expect.any(Function),
    ResponseValidationLinkPlugin: expect.any(Function),
  })
})
