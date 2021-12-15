jest.mock('react-query', () => {
  const version = process.env.REACT_QUERY_VERSION || 'react-query';

  return jest.requireActual(version);
});
