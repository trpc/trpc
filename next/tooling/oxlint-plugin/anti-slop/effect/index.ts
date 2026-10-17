import { eslintCompatPlugin } from '@oxlint/plugins';

import { noManualTagComparisonRule } from './rules/no-manual-tag-comparison.ts';
import { noManualTaggedConstructionRule } from './rules/no-manual-tagged-construction.ts';
import { preferEffectMatchRule } from './rules/prefer-effect-match.ts';

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const antiSlopEffectPlugin = eslintCompatPlugin({
  meta: { name: 'anti-slop-effect' },
  rules: {
    'no-manual-tag-comparison': noManualTagComparisonRule,
    'no-manual-tagged-construction': noManualTaggedConstructionRule,
    'prefer-effect-match': preferEffectMatchRule,
  },
});

export default antiSlopEffectPlugin;
