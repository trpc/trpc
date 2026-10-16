it('exports plugins', async () => {
  await expect(import('.')).resolves.toMatchObject({
    BatchHandlerPlugin: expect.any(Function),
    CORSHandlerPlugin: expect.any(Function),
    RequestHeadersHandlerPlugin: expect.any(Function),
    ResponseHeadersHandlerPlugin: expect.any(Function),
    GetMethodCsrfProtectionHandlerPlugin: expect.any(Function),
    MethodOverrideHandlerPlugin: expect.any(Function),
    RethrowHandlerPlugin: expect.any(Function),
    RequestCompressionHandlerPlugin: expect.any(Function),
    RequestLimitHandlerPlugin: expect.any(Function),
    ResponseCompressionHandlerPlugin: expect.any(Function),
  })
})
