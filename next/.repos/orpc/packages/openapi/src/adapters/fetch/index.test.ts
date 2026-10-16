it('exports OpenAPIHandler and OpenAPILink', async () => {
  await expect(import('.')).resolves.toMatchObject({
    OpenAPIHandler: expect.any(Function),
    OpenAPILink: expect.any(Function),
  })
})
