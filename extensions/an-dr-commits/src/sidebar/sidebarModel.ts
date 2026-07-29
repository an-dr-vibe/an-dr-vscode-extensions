import { RepositoryStatus } from "@/repo-manager/repositoryStatus";

/** Creates the small, serializable state sent to a future Activity Bar view. */
export function createSidebarModel(status: RepositoryStatus) {
  return {
    repository: status.repository,
    isDirty: status.isDirty,
    updatedAt: status.updatedAt
  };
}
