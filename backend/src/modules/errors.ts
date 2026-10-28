export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function ensure(
  value: unknown,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): asserts value {
  if (!value) throw new ApiError(status, code, message, details);
}
