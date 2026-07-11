import * as path from 'path';
import { promises as fs } from 'fs';

import { workspace, OutputChannel, WorkspaceFolder } from 'vscode';
import { Git, Repository } from './git/git';
import { Ref, Branch } from './git/api/git';
import { normalizePath } from './fsUtils';
import { API as GitAPI } from './typings/git';

export async function createGit(gitApi: GitAPI, outputChannel: OutputChannel): Promise<Git> {
    outputChannel.appendLine(`Using git from ${gitApi.git.path}`);
    return new Git({
        gitPath: gitApi.git.path,
        userAgent: '',
        version: '',
    });
}

export function getWorkspaceFolders(repositoryFolder: string): WorkspaceFolder[] {
    const normRepoFolder = normalizePath(repositoryFolder);
    const allWorkspaceFolders = workspace.workspaceFolders || [];
    const workspaceFolders = allWorkspaceFolders.filter(ws => {
        const normWsFolder = normalizePath(ws.uri.fsPath);
        return normWsFolder === normRepoFolder ||
            // workspace folder is subfolder of repository (or equal)
            normWsFolder.startsWith(normRepoFolder + path.sep) ||
            // repository is subfolder of workspace folder
            normRepoFolder.startsWith(normWsFolder + path.sep);
    });
    return workspaceFolders;
}

export function getGitRepositoryFolders(git: GitAPI, selectedFirst=false): string[] {
    let repos = git.repositories;
    if (selectedFirst) {
        repos = [...repos];
        repos.sort((r1, r2) => (r2.ui.selected as any) - (r1.ui.selected as any));
    }
    const rootPaths = repos.map(r => r.rootUri.fsPath).filter(p => getWorkspaceFolders(p).length > 0);
    return rootPaths;
}

export async function getAbsGitDir(repo: Repository): Promise<string> {
    // We don't use --absolute-git-dir here as that requires git >= 2.13.
    let res = await repo.exec(['rev-parse', '--git-dir']);
    let dir = res.stdout.trim();
    if (!path.isAbsolute(dir)) {
        dir = path.join(repo.root, dir);
    }
    return dir;
}

export async function getAbsGitCommonDir(repo: Repository): Promise<string> {
    let res = await repo.exec(['rev-parse', '--git-common-dir']);
    let dir = res.stdout.trim();
    if (!path.isAbsolute(dir)) {
        dir = path.join(repo.root, dir);
    }
    return dir;
}

export async function getDefaultBranch(repo: Repository, head: Ref): Promise<string | undefined> {
    // determine which remote HEAD is tracking
    let remote: string
    if (head.name) {
        let headBranch: Branch;
        try {
            headBranch = await repo.getBranch(head.name);
        } catch (e) {
            // this can happen on a newly initialized repo without commits
            return;
        }
        if (!headBranch.upstream) {
            return;
        }
        remote = headBranch.upstream.remote;
    } else {
        // detached HEAD, fall-back and try 'origin'
        remote = 'origin';
    }
    // determine default branch for the remote
    const remoteHead = `refs/remotes/${remote}/HEAD`;
    try {
        const result = await repo.exec(['symbolic-ref', '--short', remoteHead]);
        const remoteHeadBranch = result.stdout.trim();
        return remoteHeadBranch;
    } catch (e) {
        return;
    }
}

export async function getBranchCommit(branchName: string, repo: Repository): Promise<string> {
    // a cheaper alternative to repo.getBranch()
    // Uses git rev-parse which works with all ref storage formats (traditional, packed-refs, reftable)
    try {
        const result = await repo.exec(['rev-parse', `refs/heads/${branchName}`]);
        const commit = result.stdout.trim();
        if (commit) {
            return commit;
        }
    } catch (e) {
        // Branch doesn't exist or other error
    }
    throw new Error(`Could not determine commit for "${branchName}"`);
}

export async function getHeadModificationDate(absGitDir: string): Promise<Date> {
    const headPath = path.join(absGitDir, 'HEAD');
    const stats = await fs.stat(headPath);
    return stats.mtime;
}

export interface IDiffStatus {
    /**
     * A Addition of a file
     * D Deletion of a file
     * M Modification of file contents
     * R Renaming of a file
     * C File has merge conflicts
     * U Untracked file
     * T Type change (regular/symlink etc.)
     */
    status: StatusCode

    /** absolute path to src file on disk */
    srcAbsPath: string

    /** absolute path to dst file on disk */
    dstAbsPath: string

    /** True if this was or is a submodule */
    isSubmodule: boolean

    /** Lines added, or null if not known (untracked files) or not countable (binary files) */
    insertions: number | null

    /** Lines removed, or null if not known (untracked files) or not countable (binary files) */
    deletions: number | null
}

const MODE_REGULAR_FILE = '100644';
const MODE_EMPTY = '000000';
const MODE_SUBMODULE = '160000';

class DiffStatus implements IDiffStatus {
    readonly srcAbsPath: string;
    readonly dstAbsPath: string;
    readonly isSubmodule: boolean;
    insertions: number | null = null;
    deletions: number | null = null;

    constructor(repoRoot: string, public status: StatusCode, srcRelPath: string, dstRelPath: string | undefined, srcMode: string, dstMode: string) {
        this.srcAbsPath = path.join(repoRoot, srcRelPath);
        this.dstAbsPath = dstRelPath ? path.join(repoRoot, dstRelPath) : this.srcAbsPath;
        this.isSubmodule = srcMode == MODE_SUBMODULE || dstMode == MODE_SUBMODULE;
    }
}

export type StatusCode = 'A' | 'D' | 'M' | 'C' | 'U' | 'T' | 'R';

function sanitizeStatus(status: string): StatusCode {
    if (status == 'U') {
        return 'C';
    }
    if (status.length != 1 || 'ADMTR'.indexOf(status) == -1) {
        throw new Error('unsupported git status: ' + status);
    }
    return status as StatusCode;
}

// https://git-scm.com/docs/git-diff-index#_raw_output_format
const MODE_LEN = 6;
const SHA1_LEN = 40;
const SRC_MODE_OFFSET = 1;
const DST_MODE_OFFSET = 2 + MODE_LEN;
const STATUS_OFFSET = 2 * MODE_LEN + 2 * SHA1_LEN + 5;

function parseDiffIndexOutput(repoRoot: string, out: string): IDiffStatus[] {
    const entries: IDiffStatus[] = [];
    while (out) {
        const srcMode = out.substr(SRC_MODE_OFFSET, MODE_LEN);
        const dstMode = out.substr(DST_MODE_OFFSET, MODE_LEN);
        const status = out[STATUS_OFFSET];
        out = out.substr(STATUS_OFFSET + 1);
        let srcPathStart = out.indexOf('\0') + 1;
        out = out.substr(srcPathStart);
        let nextNul = out.indexOf('\0');
        const srcPath = out.substring(0, nextNul);
        out = out.substr(nextNul + 1);
        let dstPath: string | undefined;
        if (status === 'C' || status === 'R') {
            nextNul = out.indexOf('\0');
            dstPath = out.substring(0, nextNul);
            out = out.substr(nextNul + 1);
        }
        entries.push(new DiffStatus(
            repoRoot,
            sanitizeStatus(status),
            srcPath, dstPath,
            srcMode, dstMode));
    }
    return entries;
}

interface NumStat {
    insertions: number | null;
    deletions: number | null;
}

/**
 * Parses `--numstat -z` output (shared by diff/diff-index/diff-tree - the format is identical
 * regardless of which of those emits it) into a lookup by repo-root-relative path. A record is
 * normally `insertions TAB deletions TAB path NUL`; for renames/copies the path field is empty
 * and is instead followed by two separately NUL-terminated paths (old, new) - keyed here by the
 * new path, since that's what IDiffStatus entries are merged against (dstAbsPath). `-` in the
 * insertions/deletions field (binary files) is left as null rather than parsed as a number.
 */
function parseNumStatOutput(output: string[]): Map<string, NumStat> {
    const stats = new Map<string, NumStat>();
    let i = 0;
    while (i < output.length && output[i] !== '') {
        const fields = output[i].split('\t');
        if (fields.length !== 3) break;
        const insertions = fields[0] === '-' ? null : parseInt(fields[0], 10);
        const deletions = fields[1] === '-' ? null : parseInt(fields[1], 10);
        if (fields[2] !== '') {
            stats.set(fields[2], { insertions, deletions });
            i += 1;
        } else {
            stats.set(output[i + 2], { insertions, deletions });
            i += 3;
        }
    }
    return stats;
}

/**
 * Fetches `--numstat` for the same comparison `statuses` was already built from (identical args,
 * with `--numstat` substituted for the raw/default format) and merges insertions/deletions into
 * each entry in place, matched by repo-root-relative dstAbsPath. Untracked entries (status 'U')
 * are left at their default null/null - numstat only covers tracked-file diffs, and there's
 * nothing to diff an untracked file against (matches an-dr-commits' own precedent for the same
 * case). Fetch failures are swallowed - the stats are a bonus, not worth failing the whole tree
 * refresh over.
 */
async function applyNumStats(repo: Repository, repoRoot: string, numStatArgs: string[], statuses: IDiffStatus[]): Promise<void> {
    const numStatResult = await repo.exec(numStatArgs).catch(() => null);
    if (!numStatResult) {
        return;
    }
    const numStats = parseNumStatOutput(numStatResult.stdout.split('\0'));
    for (const status of statuses) {
        if (status.status === 'U') {
            continue;
        }
        // git's own output (both the numStats keys and, on Windows, path.relative's separators)
        // needs forward slashes here - normalizePath (imported above) only fixes drive-letter
        // casing, not separators, so it isn't enough on its own for this lookup.
        const relPath = path.relative(repoRoot, status.dstAbsPath).replace(/\\/g, '/');
        const stat = numStats.get(relPath);
        if (stat) {
            status.insertions = stat.insertions;
            status.deletions = stat.deletions;
        }
    }
}

export async function diffIndex(repo: Repository, ref: string, refreshIndex: boolean, findRenames: boolean, renameThreshold: number, omitUntrackedFiles: boolean, omitUnstagedChanges: boolean): Promise<IDiffStatus[]> {
    if (refreshIndex) {
        // avoid superfluous diff entries if files only got touched
        // (see https://github.com/letmaik/vscode-git-tree-compare/issues/37)
        try {
            await repo.exec(['update-index', '--refresh', '-q']);
        } catch (e) {
            // ignore errors as this is a bonus anyway
        }
    }

    // exceptions can happen with newly initialized repos without commits, or when git is busy
    const repoRoot = normalizePath(repo.root);
    const renamesFlag = findRenames ? `--find-renames=${renameThreshold}%`  : '--no-renames';
    const cachedFlag: string[] = omitUnstagedChanges ? ['--cached'] : [];
    const diffIndexArgs = ['diff-index', '-z', renamesFlag, ...cachedFlag, ref, '--'];
    let diffIndexResult = await repo.exec(diffIndexArgs);

    let untrackedStatuses: IDiffStatus[] = [];
    if (!omitUntrackedFiles) {
        let untrackedResult = await repo.exec(['ls-files', '-z', '--others', '--exclude-standard']);
        untrackedStatuses = untrackedResult.stdout.split('\0')
            .slice(0, -1)
            .map(line => new DiffStatus(repoRoot, 'U' as 'U', line, undefined, MODE_EMPTY, MODE_REGULAR_FILE));
    }

    const diffIndexStatuses = parseDiffIndexOutput(repoRoot, diffIndexResult.stdout);

    const untrackedAbsPaths = new Set(untrackedStatuses.map(status => status.dstAbsPath))

    // If a file was removed (D in diff-index) but was then re-introduced and not committed yet,
    // then that file also appears as untracked (in ls-files). We need to decide which status to keep.
    // Since the untracked status is newer it gets precedence.
    const filteredDiffIndexStatuses = diffIndexStatuses.filter(status => !untrackedAbsPaths.has(status.srcAbsPath));

    const statuses = filteredDiffIndexStatuses.concat(untrackedStatuses);
    statuses.sort((s1, s2) => s1.dstAbsPath.localeCompare(s2.dstAbsPath))

    const numStatArgs = ['diff-index', '--numstat', '-z', renamesFlag, ...cachedFlag, ref, '--'];
    await applyNumStats(repo, repoRoot, numStatArgs, statuses);

    return statuses;
}

export async function hasUncommittedChanges(repo: Repository, path: string, ignoreUntracked: boolean = false): Promise<boolean> {
    const args = ['status', '-z'];
    if (ignoreUntracked) {
        args.push('-uno');
    }
    args.push(path);
    const result = await repo.exec(args);
    return result.stdout.trim() !== '';
}

export async function rmFile(repo: Repository, absPath: string): Promise<void> {
    await repo.exec(['rm', '-f', absPath]);
}

export async function diffCommits(repo: Repository, from: string, to: string, findRenames: boolean, renameThreshold: number): Promise<IDiffStatus[]> {
    const repoRoot = normalizePath(repo.root);
    const renamesFlag = findRenames ? `--find-renames=${renameThreshold}%` : '--no-renames';
    const result = await repo.exec(['diff-tree', '-r', '-z', renamesFlag, from, to, '--']);
    const statuses = parseDiffIndexOutput(repoRoot, result.stdout);

    const numStatArgs = ['diff-tree', '-r', '--numstat', '-z', renamesFlag, from, to, '--'];
    await applyNumStats(repo, repoRoot, numStatArgs, statuses);

    return statuses;
}
