it('exports somethings', async () => {
  await expect(import('.')).resolves.toMatchObject({
    allAbortSignal: expect.any(Function),
  })
})
