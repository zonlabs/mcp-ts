function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Extracts a numeric HTTP status code from an unknown error object.
 * Handles SDK HTTP error shapes that surface status in .code, .status, or .data.status.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as {
    code?: unknown;
    status?: unknown;
    data?: { status?: unknown; cause?: unknown };
  };
  if (typeof record.code === 'number') return record.code;
  if (typeof record.status === 'number') return record.status;
  if (typeof record.data?.status === 'number') return record.data.status;
  return undefined;
}

/**
 * Extracts the underlying cause of an error (error.cause), avoiding cycles.
 */
function getErrorCause(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { cause?: unknown; data?: { cause?: unknown } };
  return record.cause ?? record.data?.cause;
}

/**
 * Returns true when the error indicates the remote server does not support the
 * requested transport method (405 Method Not Allowed / 404 Not Found / Not Implemented).
 * Used to trigger automatic SSE fallback when a Streamable HTTP connection is rejected.
 */
export function isTransportNotImplemented(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 404 || status === 405) return true;

  // Recursively check the error cause to handle wrapped errors.
  const cause = getErrorCause(error);
  if (cause && cause !== error && isTransportNotImplemented(cause)) return true;

  const msg = toErrorMessage(error);
  return (
    msg.includes('404') ||
    msg.includes('405') ||
    msg.includes('Error POSTing to endpoint: Not Found') ||
    msg.includes('Not Implemented') ||
    msg.includes('not implemented') ||
    msg.toLowerCase().includes('method not allowed') ||
    msg.toLowerCase().includes('not found')
  );
}
