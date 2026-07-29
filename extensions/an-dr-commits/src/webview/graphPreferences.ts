/** Browser-side graph preferences that remain serializable with repository state. */
export interface GraphPreferences {
  readonly showRemoteBranches: boolean;
  readonly showUncommittedChanges: boolean;
  readonly firstParent: boolean;
}

export const defaultGraphPreferences: GraphPreferences = {
  showRemoteBranches: true,
  showUncommittedChanges: true,
  firstParent: false
};
