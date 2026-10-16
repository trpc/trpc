import { getIssueMessage, parseFormData } from './form-data'

it('parseFormData', () => {
  expect(parseFormData(new FormData())).toEqual({})

  const form = new FormData()
  form.append('a', '1')
  form.append('user[name]', 'John')
  form.append('user[age]', '20')
  form.append('user[friends][]', 'Bob')
  form.append('user[friends][]', 'Alice')
  form.append('user[friends][]', 'Charlie')
  form.append('thumb', new Blob(['hello']), 'thumb.png')

  expect(parseFormData(form)).toEqual({
    a: '1',
    user: {
      name: 'John',
      age: '20',
      friends: ['Bob', 'Alice', 'Charlie'],
    },
    thumb: form.get('thumb'),
  })
})

it('getIssueMessage', () => {
  expect(getIssueMessage(undefined, 'user[name]')).toBeUndefined()
  expect(getIssueMessage({}, 'user[name]')).toBeUndefined()
  expect(getIssueMessage({ data: {} }, 'user[name]')).toBeUndefined()
  expect(getIssueMessage({ data: { issues: {} } }, 'user[name]')).toBeUndefined()
  expect(getIssueMessage({ data: { issues: [] } }, 'user[name]')).toBeUndefined()
  expect(getIssueMessage({ data: { issues: [{}] } }, 'user[name]')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi' }] } }, '')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi' }] } }, 'user[name]')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['user', 'name'] }] } }, 'user[name]')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['user', 'name'] }] } }, 'user[age]')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: [{ key: 'user' }, { key: 'name' }] }] } }, 'user[name]')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: [{ key: 'user' }, { key: 'name' }] }] } }, 'user[age]')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['users', '0'] }] } }, 'users[0]')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['users', '0'] }] } }, 'users[]')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['users', '0'] }] } }, 'users[1]')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: [{ key: '0' }] }] } }, '0')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: [{ key: '0' }] }] } }, '')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: [{ key: '0' }] }] } }, '1')).toBeUndefined()

  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['address2'] }] } }, '')).toBeUndefined()
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['user', 'phone1'] }] } }, '')).toBeUndefined()
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['10'] }] } }, '')).toBe('hi')
  expect(getIssueMessage({ data: { issues: [{ message: 'hi', path: ['01'] }] } }, '')).toBeUndefined()
})
