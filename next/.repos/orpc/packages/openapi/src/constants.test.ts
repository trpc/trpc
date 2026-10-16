it('exports', async () => {
  await expect(import('./constants')).resolves.toMatchObject({
    DEFAULT_OPENAPI_METHOD: expect.any(String),
    DEFAULT_OPENAPI_SUCCESS_DESCRIPTION: expect.any(String),
    DEFAULT_OPENAPI_INPUT_STRUCTURE: expect.any(String),
    DEFAULT_OPENAPI_OUTPUT_STRUCTURE: expect.any(String),
  })
})
