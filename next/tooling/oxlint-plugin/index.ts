import acronymCase from './acronym-case.ts';
import jsdoc from './jsdoc.ts';

export default {
  meta: { name: 'trpc' },
  rules: {
    'acronym-case': acronymCase,
    jsdoc,
  },
};
