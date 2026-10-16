it('exports server function and server functionable, deferred interceptors, form helpers', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    createServerFunction: expect.any(Function),
    createServerFunctionable: expect.any(Function),
    createServerFormFunction: expect.any(Function),
    createServerFormFunctionable: expect.any(Function),
    onStartDeferred: expect.any(Function),
    onSuccessDeferred: expect.any(Function),
    onErrorDeferred: expect.any(Function),
    onFinishDeferred: expect.any(Function),
    getIssueMessage: expect.any(Function),
    parseFormData: expect.any(Function),
  })
})
