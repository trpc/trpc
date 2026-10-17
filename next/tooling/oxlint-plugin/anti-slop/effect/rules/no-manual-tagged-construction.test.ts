import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import { noManualTaggedConstructionRule } from './no-manual-tagged-construction.ts';

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester().run(
  'no-manual-tagged-construction',
  noManualTaggedConstructionRule,
  {
    valid: [
      'Match.when({ _tag: "Ready" }, handleReady);',
      'Match.not({ "_tag": "Pending" });',
      'Ready.make({ value });',
      'new NotFound({ id });',
      '({ _tag: tag, value });',
    ],
    invalid: [
      {
        code: 'const value = { _tag: "Ready", payload };',
        errors: [{ messageId: 'manualConstruction' }],
      },
      {
        code: 'const value = { ["_tag"]: "Ready" };',
        errors: [{ messageId: 'manualConstruction' }],
      },
    ],
  },
);
