/** Represents a completed Git operation without exposing process internals. */
export interface CommandResult {
  readonly operation: string;
  readonly succeeded: boolean;
  readonly message?: string;
}

export function createCommandResult(
  operation: string,
  succeeded: boolean,
  message?: string
): CommandResult {
  return { operation, succeeded, message };
}
