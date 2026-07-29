/** Public identifiers change only during the one-time approved cutover. */
export const stagingIdentity = {
  extensionId: "an-dr.an-dr-com-mit-s",
  namespace: "an-dr-com-mit-s",
  documentScheme: "an-dr-com-mit-s"
} as const;

export const finalIdentity = {
  extensionId: "an-dr.an-dr-commits",
  namespace: "an-dr-commits",
  documentScheme: "an-dr-commits",
  activityContainer: "an-dr-commits-container",
  activityView: "an-dr-commits.activityView"
} as const;
