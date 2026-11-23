/** Whether an input is binary: a `Uint8Array`, `Blob` or `File`. */
export function isOctetType(
  input: unknown,
): input is Uint8Array<ArrayBuffer> | Blob {
  return (
    input instanceof Uint8Array ||
    // File extends from Blob but is only available in nodejs from v20
    input instanceof Blob
  );
}

/** Whether an input is `FormData`. */
export function isFormData(input: unknown) {
  return input instanceof FormData;
}

/**
 * Whether an input can't be sent as JSON: binary data or `FormData`. Use
 * it in a `splitLink` to send such inputs with `httpLink`.
 * @see https://trpc.io/docs/server/non-json-content-types#client-setup
 */
export function isNonJsonSerializable(input: unknown) {
  return isOctetType(input) || isFormData(input);
}
