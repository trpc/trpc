import acronymCase from './acronym-case.ts';
import jsdoc from './jsdoc.ts';

export default {
  meta: { name: 'trpcdev' },
  rules: {
    'acronym-case': acronymCase,
    jsdoc,
  },
};
