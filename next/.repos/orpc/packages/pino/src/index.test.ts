it('exports PinoHandlerPlugin', async () => {
  expect(Object.keys(await import('./index'))).toContain('PinoHandlerPlugin')
})
