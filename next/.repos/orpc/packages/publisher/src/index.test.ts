it('exports Publisher', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    Publisher: expect.any(Function),
  })
})
