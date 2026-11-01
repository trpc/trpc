/** Metadata exposed when a procedure is marked as deprecated. */
export interface DeprecationMeta {
  isDeprecated?: boolean;
  deprecationReason?: string;
  alternative?: string;
}

/**
 * Marks procedure metadata as deprecated while preserving the optional
 * explanation and migration hint supplied by the caller.
 */
export function markProcedureDeprecated(
  meta: DeprecationMeta,
): DeprecationMeta {
  return { ...meta, isDeprecated: true };
}
