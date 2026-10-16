it('exports utils, DelegatingJsonSchemaConverter, StandardJsonSchemaConverter, JsonSchemaCoercer, SmartCoercionHandlerPlugin, SmartCoercionLinkPlugin', async () => {
  await expect(import('.')).resolves.toMatchObject({
    isJsonObjectSchema: expect.any(Function),
    combineJsonSchemasWithComposition: expect.any(Function),
    ensureJsonSchemaObject: expect.any(Function),
    DelegatingJsonSchemaConverter: expect.any(Function),
    StandardJsonSchemaConverter: expect.any(Function),
    JsonSchemaCoercer: expect.any(Function),
    SmartCoercionHandlerPlugin: expect.any(Function),
    SmartCoercionLinkPlugin: expect.any(Function),
  })
})
