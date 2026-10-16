it('exports', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    handlerGen: expect.any(Function),
    middlewareGen: expect.any(Function),
    EffectSchemaToJsonSchemaConverter: expect.any(Function),
    toStandardSchema: expect.any(Function),
    catchORPCError: expect.any(Function),
    catchORPCErrorCode: expect.any(Function),
    catchORPCErrorCodes: expect.any(Function),
    createEffectClient: expect.any(Function),
  })
})
