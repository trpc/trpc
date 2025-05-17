import solid from 'vite-plugin-solid';
import { default as config } from '../../vitest.config';

if (config.plugins == undefined) {
  config.plugins = [solid()];
} else {
  config.plugins.push(solid());
}

if (config.resolve == undefined) {
  config.resolve = { conditions: ['development', 'browser'] };
} else {
  if (config.resolve.conditions == undefined) {
    config.resolve.conditions = ['development', 'browser'];
  } else {
    config.resolve.conditions.push('development', 'browser');
  }
}

export default config;
