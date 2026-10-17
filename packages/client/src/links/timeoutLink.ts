/**
 * tRPC - Procedure Timeout Abort Link
 */
export function createTimeoutLink(timeoutMs = 10000) {
  return () =>
    ({ op, next }: { op: any; next: (op: any) => Promise<any> }) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `tRPC request timed out after ${timeoutMs}ms for path: ${op.path}`,
            ),
          );
        }, timeoutMs);

        next(op)
          .then((res) => {
            clearTimeout(timer);
            resolve(res);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    };
}
