/** Reports staging capabilities without registering final-identity command IDs. */
export function describeUnavailableCapability(command: string): string {
  return `${command} is not available until the MIT transition cutover is complete.`;
}
