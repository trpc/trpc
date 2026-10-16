it('exports openapi meta, OpenAPIGenerator, OpenAPISerializer, OpenAPIJsonSerializer, BracketNotationSerializer', async () => {
  await expect(import('.')).resolves.toMatchObject({
    openapi: expect.any(Function),
    OpenAPIGenerator: expect.any(Function),
    OpenAPISerializer: expect.any(Function),
    OpenAPIJsonSerializer: expect.any(Function),
    BracketNotationSerializer: expect.any(Function),
  })
})
