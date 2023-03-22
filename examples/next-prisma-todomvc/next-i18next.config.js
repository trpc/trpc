const path = require('path');

/** @type {import("next-i18next").UserConfig} */
const config = {
  debug: process.env.NODE_ENV === 'development',
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'sv'],
    localeDetection: false,
  },
  localePath: path.resolve('./public/locales'),
};

module.exports = config;
