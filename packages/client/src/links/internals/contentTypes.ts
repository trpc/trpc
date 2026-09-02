export function isOctetType(
  input: unknown,
): input is Uint8Array<ArrayBuffer> | Blob {
  return (
    input instanceof Uint8Array ||
    // File extends from Blob but is only available in nodejs from v20
    input instanceof Blob
  );
}

export function isFormData(input: unknown) {
  return input instanceof FormData;
}

/**
 * `true` when `input` cannot be JSON-serialized and must be sent as
 * `multipart/form-data` (`FormData`) or `application/octet-stream`
 * (`Blob` / `File` / `Uint8Array`).
 *
 * @see https://trpc.io/docs/server/non-json-content-types
 */
export function isNonJsonSerializable(input: unknown) {
  return isOctetType(input) || isFormData(input);
}
