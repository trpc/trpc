/**
 * G) No registry object: each error is declared once on its own, with its
 * status and schema, and resolvers return it. That's what every option's
 * client does now (a call's union is what its procedure returns), so G is
 * the others without their list: nothing checks two modules don't define
 * the same tag, and OpenAPI comes from v12's type generator rather than a
 * registry.
 */
export { defineError } from '../shared/define.ts';
