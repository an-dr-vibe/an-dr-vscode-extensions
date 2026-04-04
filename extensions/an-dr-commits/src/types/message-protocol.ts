import { BaseMessage, ErrorInfo, RepoRequest, ResponseWithErrorInfo, ResponseWithMultiErrorInfo, DeepReadonly, DeepWriteable, Writeable } from './base';
import { GitCommit, GitCommitDetails, GitCommitStash, GitConfigLocation, GitFileChange, GitFileStatus, GitPushBranchMode, GitRepoConfig, GitResetMode, GitStash, GitTagDetails } from './git-domain';
import { CodeReview, CommitsBranchPanelState, GitRepoSet, GitRepoState, PullRequestConfig } from './repo-state';
import { CommitOrdering, CommitsColumnVisibility, TagType } from './settings';
import { CommitsViewGlobalState, CommitsViewWorkspaceState, GitRepoInProgressState, GitRepoInProgressStateType, LoadCommitsViewTo } from './view-state';

export interface RequestAddRemote extends RepoRequest {
	readonly command: 'addRemote';
	readonly name: string;
	readonly url: string;
	readonly pushUrl: string | null;
	readonly fetch: boolean;
}
export interface ResponseAddRemote extends ResponseWithErrorInfo {
	readonly command: 'addRemote';
}

export interface RequestAddTag extends RepoRequest {
	readonly command: 'addTag';
	readonly commitHash: string;
	readonly tagName: string;
	readonly type: TagType;
	readonly message: string;
	readonly pushToRemote: string | null;
	readonly pushSkipRemoteCheck: boolean;
	readonly force: boolean;
}
export interface ResponseAddTag extends ResponseWithMultiErrorInfo {
	readonly command: 'addTag';
	readonly repo: string;
	readonly tagName: string;
	readonly pushToRemote: string | null;
	readonly commitHash: string;
}

export interface RequestApplyStash extends RepoRequest {
	readonly command: 'applyStash';
	readonly selector: string;
	readonly reinstateIndex: boolean;
}
export interface ResponseApplyStash extends ResponseWithErrorInfo {
	readonly command: 'applyStash';
}

export interface RequestBranchFromStash extends RepoRequest {
	readonly command: 'branchFromStash';
	readonly selector: string;
	readonly branchName: string;
}
export interface ResponseBranchFromStash extends ResponseWithErrorInfo {
	readonly command: 'branchFromStash';
}

export interface RequestCheckoutBranch extends RepoRequest {
	readonly command: 'checkoutBranch';
	readonly branchName: string;
	readonly remoteBranch: string | null;
	readonly selectedBranches?: string[] | null;
	readonly selectedTags?: string[];
	readonly scrollTop?: number;
	readonly branchPanelState?: CommitsBranchPanelState;
	readonly pullAfterwards: {
		readonly branchName: string;
		readonly remote: string;
		readonly createNewCommit: boolean;
		readonly squash: boolean;
	} | null;
}
export interface ResponseCheckoutBranch extends ResponseWithMultiErrorInfo {
	readonly command: 'checkoutBranch';
	readonly pullAfterwards: {
		readonly branchName: string;
		readonly remote: string;
	} | null;
}

export interface RequestCheckoutCommit extends RepoRequest {
	readonly command: 'checkoutCommit';
	readonly commitHash: string;
}
export interface ResponseCheckoutCommit extends ResponseWithErrorInfo {
	readonly command: 'checkoutCommit';
}

export interface RequestCherrypickCommit extends RepoRequest {
	readonly command: 'cherrypickCommit';
	readonly commitHash: string;
	readonly parentIndex: number;
	readonly recordOrigin: boolean;
	readonly noCommit: boolean;
}
export interface ResponseCherrypickCommit extends ResponseWithMultiErrorInfo {
	readonly command: 'cherrypickCommit';
}

export interface RequestCleanUntrackedFiles extends RepoRequest {
	readonly command: 'cleanUntrackedFiles';
	readonly directories: boolean;
}
export interface ResponseCleanUntrackedFiles extends ResponseWithErrorInfo {
	readonly command: 'cleanUntrackedFiles';
}

export interface RequestCommitDetails extends RepoRequest {
	readonly command: 'commitDetails';
	readonly commitHash: string;
	readonly hasParents: boolean;
	readonly stash: GitCommitStash | null;
	readonly avatarEmail: string | null;
	readonly refresh: boolean;
}
export interface ResponseCommitDetails extends ResponseWithErrorInfo {
	readonly command: 'commitDetails';
	readonly commitDetails: GitCommitDetails | null;
	readonly avatar: string | null;
	readonly codeReview: CodeReview | null;
	readonly refresh: boolean;
}

export interface RequestCompareCommits extends RepoRequest {
	readonly command: 'compareCommits';
	readonly commitHash: string;
	readonly compareWithHash: string;
	readonly fromHash: string;
	readonly toHash: string;
	readonly refresh: boolean;
}
export interface ResponseCompareCommits extends ResponseWithErrorInfo {
	readonly command: 'compareCommits';
	readonly commitHash: string;
	readonly compareWithHash: string;
	readonly fileChanges: ReadonlyArray<GitFileChange>;
	readonly codeReview: CodeReview | null;
	readonly refresh: boolean;
}

export interface RequestCopyFilePath extends RepoRequest {
	readonly command: 'copyFilePath';
	readonly filePath: string;
	readonly absolute: boolean;
}
export interface ResponseCopyFilePath extends ResponseWithErrorInfo {
	readonly command: 'copyFilePath';
}

export interface RequestCopyToClipboard extends BaseMessage {
	readonly command: 'copyToClipboard';
	readonly type: string;
	readonly data: string;
}
export interface ResponseCopyToClipboard extends ResponseWithErrorInfo {
	readonly command: 'copyToClipboard';
	readonly type: string;
}

export interface RequestCreateArchive extends RepoRequest {
	readonly command: 'createArchive';
	readonly ref: string;
}
export interface ResponseCreateArchive extends ResponseWithErrorInfo {
	readonly command: 'createArchive';
}

export interface RequestCreateBranch extends RepoRequest {
	readonly command: 'createBranch';
	readonly commitHash: string;
	readonly branchName: string;
	readonly checkout: boolean;
	readonly force: boolean;
}
export interface ResponseCreateBranch extends ResponseWithMultiErrorInfo {
	readonly command: 'createBranch';
}

export interface RequestCreatePullRequest extends RepoRequest {
	readonly command: 'createPullRequest';
	readonly config: PullRequestConfig;
	readonly sourceRemote: string;
	readonly sourceOwner: string;
	readonly sourceRepo: string;
	readonly sourceBranch: string;
	readonly push: boolean;
}
export interface ResponseCreatePullRequest extends ResponseWithMultiErrorInfo {
	readonly command: 'createPullRequest';
	readonly push: boolean;
}

export interface RequestCleanupLocalBranches extends RepoRequest {
	readonly command: 'cleanupLocalBranches';
	readonly branchNames: ReadonlyArray<string>;
	readonly forceDelete: boolean;
}
export interface ResponseCleanupLocalBranches extends ResponseWithMultiErrorInfo {
	readonly command: 'cleanupLocalBranches';
	readonly branchNames: ReadonlyArray<string>;
}

export interface RequestDeleteBranch extends RepoRequest {
	readonly command: 'deleteBranch';
	readonly branchName: string;
	readonly forceDelete: boolean;
	readonly deleteOnRemotes: ReadonlyArray<string>;
}
export interface ResponseDeleteBranch extends ResponseWithMultiErrorInfo {
	readonly command: 'deleteBranch';
	readonly repo: string;
	readonly branchName: string;
	readonly deleteOnRemotes: ReadonlyArray<string>;
}

export interface RequestDeleteRemote extends RepoRequest {
	readonly command: 'deleteRemote';
	readonly name: string;
}
export interface ResponseDeleteRemote extends ResponseWithErrorInfo {
	readonly command: 'deleteRemote';
}

export interface RequestDeleteRemoteBranch extends RepoRequest {
	readonly command: 'deleteRemoteBranch';
	readonly branchName: string;
	readonly remote: string;
}
export interface ResponseDeleteRemoteBranch extends ResponseWithErrorInfo {
	readonly command: 'deleteRemoteBranch';
}

export interface RequestDeleteTag extends RepoRequest {
	readonly command: 'deleteTag';
	readonly tagName: string;
	readonly deleteOnRemote: string | null;
}
export interface ResponseDeleteTag extends ResponseWithErrorInfo {
	readonly command: 'deleteTag';
}

export interface RequestDeleteUserDetails extends RepoRequest {
	readonly command: 'deleteUserDetails';
	readonly name: boolean;
	readonly email: boolean;
	readonly location: GitConfigLocation.Global | GitConfigLocation.Local;
}
export interface ResponseDeleteUserDetails extends ResponseWithMultiErrorInfo {
	readonly command: 'deleteUserDetails';
}

export interface RequestDropCommit extends RepoRequest {
	readonly command: 'dropCommit';
	readonly commitHash: string;
}
export interface ResponseDropCommit extends ResponseWithErrorInfo {
	readonly command: 'dropCommit';
}

export interface RequestRewordCommit extends RepoRequest {
	readonly command: 'rewordCommit';
	readonly commitHash: string;
	readonly selectedBranches?: string[] | null;
	readonly selectedTags?: string[];
	readonly scrollTop?: number;
	readonly branchPanelState?: CommitsBranchPanelState;
}
export interface ResponseRewordCommit extends ResponseWithErrorInfo {
	readonly command: 'rewordCommit';
}

export interface RequestEditCommitAuthor extends RepoRequest {
	readonly command: 'editCommitAuthor';
	readonly commitHash: string;
	readonly name: string;
	readonly email: string;
}
export interface ResponseEditCommitAuthor extends ResponseWithErrorInfo {
	readonly command: 'editCommitAuthor';
}

export interface RequestSquashCommits extends RepoRequest {
	readonly command: 'squashCommits';
	readonly commitHashes: ReadonlyArray<string>;
	readonly selectedBranches?: string[] | null;
	readonly selectedTags?: string[];
	readonly scrollTop?: number;
	readonly branchPanelState?: CommitsBranchPanelState;
}
export interface ResponseSquashCommits extends ResponseWithErrorInfo {
	readonly command: 'squashCommits';
}

export interface RequestDropStash extends RepoRequest {
	readonly command: 'dropStash';
	readonly selector: string;
}
export interface ResponseDropStash extends ResponseWithErrorInfo {
	readonly command: 'dropStash';
}

export interface RequestEditRemote extends RepoRequest {
	readonly command: 'editRemote';
	readonly nameOld: string;
	readonly nameNew: string;
	readonly urlOld: string | null;
	readonly urlNew: string | null;
	readonly pushUrlOld: string | null;
	readonly pushUrlNew: string | null;
}
export interface ResponseEditRemote extends ResponseWithErrorInfo {
	readonly command: 'editRemote';
}

export interface RequestEditUserDetails extends RepoRequest {
	readonly command: 'editUserDetails';
	readonly name: string;
	readonly email: string;
	readonly location: GitConfigLocation.Global | GitConfigLocation.Local;
	readonly deleteLocalName: boolean;
	readonly deleteLocalEmail: boolean;
}
export interface ResponseEditUserDetails extends ResponseWithMultiErrorInfo {
	readonly command: 'editUserDetails';
}

export interface RequestEndCodeReview extends RepoRequest {
	readonly command: 'endCodeReview';
	readonly id: string;
}

export interface RequestExportRepoConfig extends RepoRequest {
	readonly command: 'exportRepoConfig';
}
export interface ResponseExportRepoConfig extends ResponseWithErrorInfo {
	readonly command: 'exportRepoConfig';
}

export interface RequestFetch extends RepoRequest {
	readonly command: 'fetch';
	readonly name: string | null;
	readonly prune: boolean;
	readonly pruneTags: boolean;
}
export interface ResponseFetch extends ResponseWithErrorInfo {
	readonly command: 'fetch';
}

export interface RequestFetchAvatar extends RepoRequest {
	readonly command: 'fetchAvatar';
	readonly remote: string | null;
	readonly email: string;
	readonly commits: string[];
}
export interface ResponseFetchAvatar extends BaseMessage {
	readonly command: 'fetchAvatar';
	readonly email: string;
	readonly image: string;
}

export interface RequestFetchIntoLocalBranch extends RepoRequest {
	readonly command: 'fetchIntoLocalBranch';
	readonly remote: string;
	readonly remoteBranch: string;
	readonly localBranch: string;
	readonly force: boolean;
}
export interface ResponseFetchIntoLocalBranch extends ResponseWithErrorInfo {
	readonly command: 'fetchIntoLocalBranch';
}

export interface RequestLoadCommits extends RepoRequest {
	readonly command: 'loadCommits';
	readonly refreshId: number;
	readonly branches: ReadonlyArray<string> | null;
	readonly maxCommits: number;
	readonly showTags: boolean;
	readonly showRemoteBranches: boolean;
	readonly includeCommitsMentionedByReflogs: boolean;
	readonly onlyFollowFirstParent: boolean;
	readonly commitOrdering: CommitOrdering;
	readonly remotes: ReadonlyArray<string>;
	readonly hideRemotes: ReadonlyArray<string>;
	readonly stashes: ReadonlyArray<GitStash>;
}
export interface ResponseLoadCommits extends ResponseWithErrorInfo {
	readonly command: 'loadCommits';
	readonly refreshId: number;
	readonly commits: GitCommit[];
	readonly head: string | null;
	readonly tags: string[];
	readonly moreCommitsAvailable: boolean;
	readonly onlyFollowFirstParent: boolean;
}

export interface RequestLoadConfig extends RepoRequest {
	readonly command: 'loadConfig';
	readonly remotes: ReadonlyArray<string>;
}
export interface ResponseLoadConfig extends ResponseWithErrorInfo {
	readonly command: 'loadConfig';
	readonly repo: string;
	readonly config: GitRepoConfig | null;
}

export interface RequestLoadRepoInfo extends RepoRequest {
	readonly command: 'loadRepoInfo';
	readonly refreshId: number;
	readonly showRemoteBranches: boolean;
	readonly showStashes: boolean;
	readonly hideRemotes: ReadonlyArray<string>;
}
export interface ResponseLoadRepoInfo extends ResponseWithErrorInfo {
	readonly command: 'loadRepoInfo';
	readonly refreshId: number;
	readonly branches: ReadonlyArray<string>;
	readonly branchUpstreams: { readonly [branchName: string]: string };
	readonly goneUpstreamBranches: ReadonlyArray<string>;
	readonly remoteHeadTargets: { readonly [remoteName: string]: string };
	readonly head: string | null;
	readonly remotes: ReadonlyArray<string>;
	readonly stashes: ReadonlyArray<GitStash>;
	readonly repoInProgressState: GitRepoInProgressState | null;
	readonly isRepo: boolean;
}

export interface RequestLoadRepos extends BaseMessage {
	readonly command: 'loadRepos';
	readonly check: boolean;
}
export interface ResponseLoadRepos extends BaseMessage {
	readonly command: 'loadRepos';
	readonly repos: GitRepoSet;
	readonly lastActiveRepo: string | null;
	readonly loadViewTo: LoadCommitsViewTo;
}

export const enum MergeActionOn {
	Branch = 'Branch',
	RemoteTrackingBranch = 'Remote-tracking Branch',
	Commit = 'Commit'
}
export interface RequestMerge extends RepoRequest {
	readonly command: 'merge';
	readonly obj: string;
	readonly actionOn: MergeActionOn;
	readonly createNewCommit: boolean;
	readonly squash: boolean;
	readonly noCommit: boolean;
}
export interface ResponseMerge extends ResponseWithErrorInfo {
	readonly command: 'merge';
	readonly actionOn: MergeActionOn;
}

export interface RequestOpenExtensionSettings extends BaseMessage {
	readonly command: 'openExtensionSettings';
}
export interface ResponseOpenExtensionSettings extends ResponseWithErrorInfo {
	readonly command: 'openExtensionSettings';
}

export interface RequestOpenExternalDirDiff extends RepoRequest {
	readonly command: 'openExternalDirDiff';
	readonly fromHash: string;
	readonly toHash: string;
	readonly isGui: boolean;
}
export interface ResponseOpenExternalDirDiff extends ResponseWithErrorInfo {
	readonly command: 'openExternalDirDiff';
}

export interface RequestOpenExternalUrl extends BaseMessage {
	readonly command: 'openExternalUrl';
	readonly url: string;
}
export interface ResponseOpenExternalUrl extends ResponseWithErrorInfo {
	readonly command: 'openExternalUrl';
}

export interface RequestOpenFile extends RepoRequest {
	readonly command: 'openFile';
	readonly hash: string;
	readonly filePath: string;
}
export interface ResponseOpenFile extends ResponseWithErrorInfo {
	readonly command: 'openFile';
}

export interface RequestPopStash extends RepoRequest {
	readonly command: 'popStash';
	readonly selector: string;
	readonly reinstateIndex: boolean;
}
export interface ResponsePopStash extends ResponseWithErrorInfo {
	readonly command: 'popStash';
}

export interface RequestPruneRemote extends RepoRequest {
	readonly command: 'pruneRemote';
	readonly name: string;
}
export interface ResponsePruneRemote extends ResponseWithErrorInfo {
	readonly command: 'pruneRemote';
}

export interface RequestSetRemoteDefaultBranch extends RepoRequest {
	readonly command: 'setRemoteDefaultBranch';
	readonly remote: string;
	readonly branch: string;
}
export interface ResponseSetRemoteDefaultBranch extends ResponseWithErrorInfo {
	readonly command: 'setRemoteDefaultBranch';
}

export interface RequestPullBranch extends RepoRequest {
	readonly command: 'pullBranch';
	readonly branchName: string;
	readonly remote: string;
	readonly createNewCommit: boolean;
	readonly squash: boolean;
}
export interface ResponsePullBranch extends ResponseWithErrorInfo {
	readonly command: 'pullBranch';
}

export interface RequestPushBranch extends RepoRequest {
	readonly command: 'pushBranch';
	readonly branchName: string;
	readonly remotes: string[];
	readonly setUpstream: boolean;
	readonly mode: GitPushBranchMode;
	readonly willUpdateBranchConfig: boolean;
}
export interface ResponsePushBranch extends ResponseWithMultiErrorInfo {
	readonly command: 'pushBranch';
	readonly willUpdateBranchConfig: boolean;
	readonly repo: string;
	readonly branchName: string;
	readonly remotes: string[];
	readonly setUpstream: boolean;
}

export interface RequestPushStash extends RepoRequest {
	readonly command: 'pushStash';
	readonly message: string;
	readonly includeUntracked: boolean;
}
export interface ResponsePushStash extends ResponseWithErrorInfo {
	readonly command: 'pushStash';
}

export interface RequestPushTag extends RepoRequest {
	readonly command: 'pushTag';
	readonly tagName: string;
	readonly remotes: string[];
	readonly commitHash: string;
	readonly skipRemoteCheck: boolean;
}
export interface ResponsePushTag extends ResponseWithMultiErrorInfo {
	readonly command: 'pushTag';
	readonly repo: string;
	readonly tagName: string;
	readonly remotes: string[];
	readonly commitHash: string;
}

export const enum RebaseActionOn {
	Branch = 'Branch',
	Commit = 'Commit'
}
export interface RequestRebase extends RepoRequest {
	readonly command: 'rebase';
	readonly obj: string;
	readonly actionOn: RebaseActionOn;
	readonly ignoreDate: boolean;
	readonly interactive: boolean;
}
export interface ResponseRebase extends ResponseWithErrorInfo {
	readonly command: 'rebase';
	readonly actionOn: RebaseActionOn;
	readonly interactive: boolean;
}

export const enum GitRepoInProgressAction {
	Continue = 'continue',
	Abort = 'abort'
}
export interface RequestRepoInProgressAction extends RepoRequest {
	readonly command: 'repoInProgressAction';
	readonly state: GitRepoInProgressStateType;
	readonly action: GitRepoInProgressAction;
	readonly selectedBranches?: string[] | null;
	readonly selectedTags?: string[];
	readonly scrollTop?: number;
	readonly branchPanelState?: CommitsBranchPanelState;
}
export interface ResponseRepoInProgressAction extends ResponseWithErrorInfo {
	readonly command: 'repoInProgressAction';
	readonly action: GitRepoInProgressAction;
}

export interface ResponseRefresh extends BaseMessage {
	readonly command: 'refresh';
}

export interface RequestRenameBranch extends RepoRequest {
	readonly command: 'renameBranch';
	readonly oldName: string;
	readonly newName: string;
}
export interface ResponseRenameBranch extends ResponseWithErrorInfo {
	readonly command: 'renameBranch';
}

export interface RequestRescanForRepos extends BaseMessage {
	readonly command: 'rescanForRepos';
}

export interface RequestResetFileToRevision extends RepoRequest {
	readonly command: 'resetFileToRevision';
	readonly commitHash: string;
	readonly filePath: string;
}
export interface ResponseResetFileToRevision extends ResponseWithErrorInfo {
	readonly command: 'resetFileToRevision';
}

export interface RequestResetToCommit extends RepoRequest {
	readonly command: 'resetToCommit';
	readonly commit: string;
	readonly resetMode: GitResetMode;
}
export interface ResponseResetToCommit extends ResponseWithErrorInfo {
	readonly command: 'resetToCommit';
}

export interface RequestRevertCommit extends RepoRequest {
	readonly command: 'revertCommit';
	readonly commitHash: string;
	readonly parentIndex: number;
}
export interface ResponseRevertCommit extends ResponseWithErrorInfo {
	readonly command: 'revertCommit';
}

export interface RequestSetGlobalViewState extends BaseMessage {
	readonly command: 'setGlobalViewState';
	readonly state: CommitsViewGlobalState;
}
export interface ResponseSetGlobalViewState extends ResponseWithErrorInfo {
	readonly command: 'setGlobalViewState';
}

export interface RequestSetColumnVisibility extends BaseMessage {
	readonly command: 'setColumnVisibility';
	readonly visibility: CommitsColumnVisibility;
}
export interface ResponseSetColumnVisibility extends ResponseWithErrorInfo {
	readonly command: 'setColumnVisibility';
}

export interface RequestSetRepoState extends RepoRequest {
	readonly command: 'setRepoState';
	readonly state: GitRepoState;
}

export interface RequestSetWorkspaceViewState extends BaseMessage {
	readonly command: 'setWorkspaceViewState';
	readonly state: CommitsViewWorkspaceState;
}
export interface ResponseSetWorkspaceViewState extends ResponseWithErrorInfo {
	readonly command: 'setWorkspaceViewState';
}

export interface RequestShowErrorDialog extends BaseMessage {
	readonly command: 'showErrorMessage';
	readonly message: string;
}

export interface RequestStartCodeReview extends RepoRequest {
	readonly command: 'startCodeReview';
	readonly id: string;
	readonly files: string[];
	readonly lastViewedFile: string | null;
	readonly commitHash: string;
	readonly compareWithHash: string | null;
}
export interface ResponseStartCodeReview extends ResponseWithErrorInfo {
	readonly command: 'startCodeReview';
	readonly codeReview: CodeReview;
	readonly commitHash: string;
	readonly compareWithHash: string | null;
}

export interface RequestTagDetails extends RepoRequest {
	readonly command: 'tagDetails';
	readonly tagName: string;
	readonly commitHash: string;
}
export interface ResponseTagDetails extends ResponseWithErrorInfo {
	readonly command: 'tagDetails';
	readonly tagName: string;
	readonly commitHash: string;
	readonly details: GitTagDetails | null;
}

export interface RequestResolveSidebarTagContext extends RepoRequest {
	readonly command: 'resolveSidebarTagContext';
	readonly tagName: string;
	readonly requestId: number;
}
export interface ResponseResolveSidebarTagContext extends ResponseWithErrorInfo {
	readonly command: 'resolveSidebarTagContext';
	readonly tagName: string;
	readonly requestId: number;
	readonly context: {
		readonly hash: string;
		readonly annotated: boolean;
	} | null;
}

export const enum SidebarBatchRefType {
	LocalBranch = 'localBranch',
	RemoteBranch = 'remoteBranch',
	Tag = 'tag'
}

export interface SidebarBatchRefActionTarget {
	readonly type: SidebarBatchRefType;
	readonly name: string;
	readonly remote: string | null;
	readonly hash: string | null;
}

export const enum SidebarBatchRefActionType {
	Delete = 'delete',
	Push = 'push',
	Archive = 'archive'
}

export interface RequestSidebarBatchRefAction extends RepoRequest {
	readonly command: 'sidebarBatchRefAction';
	readonly action: SidebarBatchRefActionType;
	readonly refs: ReadonlyArray<SidebarBatchRefActionTarget>;
	readonly remotes: ReadonlyArray<string>;
	readonly setUpstream: boolean;
	readonly pushMode: GitPushBranchMode;
	readonly skipRemoteCheck: boolean;
}

export interface ResponseSidebarBatchRefAction extends BaseMessage {
	readonly command: 'sidebarBatchRefAction';
	readonly action: SidebarBatchRefActionType;
	readonly results: ReadonlyArray<{
		readonly type: SidebarBatchRefType;
		readonly name: string;
		readonly error: ErrorInfo;
	}>;
}

export interface RequestUpdateCodeReview extends RepoRequest {
	readonly command: 'updateCodeReview';
	readonly id: string;
	readonly remainingFiles: string[];
	readonly lastViewedFile: string | null;
}

export interface ResponseUpdateCodeReview extends ResponseWithErrorInfo {
	readonly command: 'updateCodeReview';
}

export interface RequestViewDiff extends RepoRequest {
	readonly command: 'viewDiff';
	readonly fromHash: string;
	readonly toHash: string;
	readonly oldFilePath: string;
	readonly newFilePath: string;
	readonly type: GitFileStatus;
	readonly viewColumn?: number;
}
export interface ResponseViewDiff extends ResponseWithErrorInfo {
	readonly command: 'viewDiff';
}

export interface RequestGetFileDiff extends RepoRequest {
	readonly command: 'getFileDiff';
	readonly fromHash: string;
	readonly toHash: string;
	readonly oldFilePath: string;
	readonly newFilePath: string;
}
export interface ResponseGetFileDiff extends BaseMessage {
	readonly command: 'getFileDiff';
	readonly diff: string | null;
	readonly error: ErrorInfo;
}

export interface RequestGetFullDiffContent extends RepoRequest {
	readonly command: 'getFullDiffContent';
	readonly fromHash: string;
	readonly toHash: string;
	readonly oldFilePath: string;
	readonly newFilePath: string;
	readonly type: GitFileStatus;
}
export interface ResponseGetFullDiffContent extends BaseMessage {
	readonly command: 'getFullDiffContent';
	readonly diff: string | null;
	readonly oldContent: string | null;
	readonly newContent: string | null;
	readonly oldExists: boolean;
	readonly newExists: boolean;
	readonly error: ErrorInfo;
}

export interface RequestViewDiffWithWorkingFile extends RepoRequest {
	readonly command: 'viewDiffWithWorkingFile';
	readonly hash: string;
	readonly filePath: string;
}
export interface ResponseViewDiffWithWorkingFile extends ResponseWithErrorInfo {
	readonly command: 'viewDiffWithWorkingFile';
}

export interface RequestViewFileAtRevision extends RepoRequest {
	readonly command: 'viewFileAtRevision';
	readonly hash: string;
	readonly filePath: string;
}
export interface ResponseViewFileAtRevision extends ResponseWithErrorInfo {
	readonly command: 'viewFileAtRevision';
}

export interface RequestViewScm extends BaseMessage {
	readonly command: 'viewScm';
}
export interface ResponseViewScm extends ResponseWithErrorInfo {
	readonly command: 'viewScm';
}

export type RequestMessage =
	RequestAddRemote
	| RequestAddTag
	| RequestApplyStash
	| RequestBranchFromStash
	| RequestCheckoutBranch
	| RequestCheckoutCommit
	| RequestCherrypickCommit
	| RequestCleanUntrackedFiles
	| RequestCommitDetails
	| RequestCompareCommits
	| RequestCopyFilePath
	| RequestCopyToClipboard
	| RequestCreateArchive
	| RequestCreateBranch
	| RequestCreatePullRequest
	| RequestCleanupLocalBranches
	| RequestDeleteBranch
	| RequestDeleteRemote
	| RequestDeleteRemoteBranch
	| RequestDeleteTag
	| RequestDeleteUserDetails
	| RequestDropCommit
	| RequestDropStash
	| RequestRewordCommit
	| RequestEditCommitAuthor
	| RequestSquashCommits
	| RequestEditRemote
	| RequestEditUserDetails
	| RequestEndCodeReview
	| RequestExportRepoConfig
	| RequestFetch
	| RequestFetchAvatar
	| RequestFetchIntoLocalBranch
	| RequestLoadCommits
	| RequestLoadConfig
	| RequestLoadRepoInfo
	| RequestLoadRepos
	| RequestMerge
	| RequestOpenExtensionSettings
	| RequestOpenExternalDirDiff
	| RequestOpenExternalUrl
	| RequestOpenFile
	| RequestPopStash
	| RequestPruneRemote
	| RequestPullBranch
	| RequestPushBranch
	| RequestPushStash
	| RequestPushTag
	| RequestRebase
	| RequestRepoInProgressAction
	| RequestRenameBranch
	| RequestRescanForRepos
	| RequestResetFileToRevision
	| RequestResetToCommit
	| RequestRevertCommit
	| RequestSetColumnVisibility
	| RequestSetGlobalViewState
	| RequestSetRepoState
	| RequestSetRemoteDefaultBranch
	| RequestSetWorkspaceViewState
	| RequestShowErrorDialog
	| RequestSidebarBatchRefAction
	| RequestStartCodeReview
	| RequestResolveSidebarTagContext
	| RequestTagDetails
	| RequestUpdateCodeReview
	| RequestViewDiff
	| RequestGetFileDiff
	| RequestGetFullDiffContent
	| RequestViewDiffWithWorkingFile
	| RequestViewFileAtRevision
	| RequestViewScm;

export type ResponseMessage =
	ResponseAddRemote
	| ResponseAddTag
	| ResponseApplyStash
	| ResponseBranchFromStash
	| ResponseCheckoutBranch
	| ResponseCheckoutCommit
	| ResponseCherrypickCommit
	| ResponseCleanUntrackedFiles
	| ResponseCompareCommits
	| ResponseCommitDetails
	| ResponseCopyFilePath
	| ResponseCopyToClipboard
	| ResponseCreateArchive
	| ResponseCreateBranch
	| ResponseCreatePullRequest
	| ResponseCleanupLocalBranches
	| ResponseDeleteBranch
	| ResponseDeleteRemote
	| ResponseDeleteRemoteBranch
	| ResponseDeleteTag
	| ResponseDeleteUserDetails
	| ResponseDropCommit
	| ResponseDropStash
	| ResponseRewordCommit
	| ResponseEditCommitAuthor
	| ResponseSquashCommits
	| ResponseEditRemote
	| ResponseEditUserDetails
	| ResponseExportRepoConfig
	| ResponseFetch
	| ResponseFetchAvatar
	| ResponseFetchIntoLocalBranch
	| ResponseLoadCommits
	| ResponseLoadConfig
	| ResponseLoadRepoInfo
	| ResponseLoadRepos
	| ResponseMerge
	| ResponseOpenExtensionSettings
	| ResponseOpenExternalDirDiff
	| ResponseOpenExternalUrl
	| ResponseOpenFile
	| ResponsePopStash
	| ResponsePruneRemote
	| ResponsePullBranch
	| ResponsePushBranch
	| ResponsePushStash
	| ResponsePushTag
	| ResponseRebase
	| ResponseRepoInProgressAction
	| ResponseRefresh
	| ResponseRenameBranch
	| ResponseResetFileToRevision
	| ResponseResetToCommit
	| ResponseRevertCommit
	| ResponseSetColumnVisibility
	| ResponseSetGlobalViewState
	| ResponseSetRemoteDefaultBranch
	| ResponseSidebarBatchRefAction
	| ResponseSetWorkspaceViewState
	| ResponseStartCodeReview
	| ResponseResolveSidebarTagContext
	| ResponseTagDetails
	| ResponseUpdateCodeReview
	| ResponseViewDiff
	| ResponseGetFileDiff
	| ResponseGetFullDiffContent
	| ResponseViewDiffWithWorkingFile
	| ResponseViewFileAtRevision
	| ResponseViewScm;

export { DeepReadonly, DeepWriteable, Writeable };
