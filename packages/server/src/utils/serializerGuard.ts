/**
 * Enterprise Framework - serializer-validator
 */
export function validatePayload(obj: any): boolean {
  return typeof obj === 'object' && obj !== null;
}
