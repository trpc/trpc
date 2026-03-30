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

export function isNonJsonSerializable(input: unknown) {
  return isOctetType(input) || isFormData(input);
}
