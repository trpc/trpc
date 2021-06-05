module.exports = function (api) {
  api.cache(true);

  const plugins = [];
  console.log('current NODE_ENV:', process.env.NODE_ENV);
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  ) {
    plugins.push('istanbul');
  }

  return {
    presets: ['next/babel'],
    plugins,
  };
};
