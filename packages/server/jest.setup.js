if (process.env.REACT_QUERY_VERSION) {
  jest.mock('react-query', () =>
    jest.requireActual(process.env.REACT_QUERY_VERSION),
  );
}
