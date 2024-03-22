import { createTson, tsonDate, tsonMap, tsonSet } from 'tupleson';

export const tson = createTson({ types: [tsonMap, tsonDate, tsonSet] });
