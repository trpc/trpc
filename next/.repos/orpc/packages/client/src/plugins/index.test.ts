it('exports plugins', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    BatchLinkPlugin: expect.any(Function),
    DedupeLinkPlugin: expect.any(Function),
    RetryLinkPlugin: expect.any(Function),
    RetryAfterLinkPlugin: expect.any(Function),
    RequestCompressionLinkPlugin: expect.any(Function),
    ResponseCompressionLinkPlugin: expect.any(Function),
    TimeoutLinkPlugin: expect.any(Function),
  })
})
