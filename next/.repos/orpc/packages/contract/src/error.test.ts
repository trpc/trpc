import { ValidationError } from './error'

it('validationError', () => {
  const issues = [{ path: ['a'], message: 'invalid' }] as any
  const error = new ValidationError({
    message: 'Validation failed',
    issues,
    invalidData: { a: 1 },
  })

  expect(error).toBeInstanceOf(Error)
  expect(error).toBeInstanceOf(ValidationError)
  expect(error.message).toBe('Validation failed')
  expect(error.issues).toBe(issues)
  expect(error.invalidData).toEqual({ a: 1 })
})
