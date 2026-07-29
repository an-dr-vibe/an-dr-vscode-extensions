/** Determines whether a graph refresh may replace the currently visible data. */
export function shouldApplyGraphRefresh(
  currentGeneration: number,
  incomingGeneration: number
): boolean {
  return incomingGeneration >= currentGeneration;
}
