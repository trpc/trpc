it('exports oc', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    oc: expect.any(Object),
  })
})
