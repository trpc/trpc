it('exports createToolFactory', async () => {
  expect(Object.keys(await import('./index'))).toContain('createToolFactory')
})
