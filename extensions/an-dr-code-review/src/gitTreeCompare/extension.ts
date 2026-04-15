import { ExtensionContext, window, Disposable, commands, extensions } from 'vscode';

import { COMMAND_NAMESPACE, CONTEXT_NAMESPACE, TREE_COMPARE_TITLE, VIEW_ID } from './constants'
import { GitTreeCompareProvider } from './treeProvider';
import { createGit } from './gitHelper';
import { toDisposable } from './git/util';
import { GitExtension } from './typings/git';
import { CommentsSelection } from '../commentsView';

export function activate(context: ExtensionContext, onSelectedSelectionChange?: (selection: CommentsSelection | undefined) => void) {
    const disposables: Disposable[] = [];
    context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

    const outputChannel = window.createOutputChannel(TREE_COMPARE_TITLE);
    disposables.push(outputChannel);

    const gitExt = extensions.getExtension<GitExtension>('vscode.git')!.exports;
    const gitApi = gitExt.getAPI(1);

    let provider: GitTreeCompareProvider | null = null;

    let runAfterInit = (fn: () => any) => {
        if (provider == null) {
            setTimeout(() => runAfterInit(fn), 100);
        } else {
            fn();
        }
    }

    commands.registerCommand(COMMAND_NAMESPACE + '.openChanges', node => {
        runAfterInit(() => {
            provider!.openChanges(node);
        });
    });

    commands.registerCommand(COMMAND_NAMESPACE + '.openFile', (node, nodes) => {
        runAfterInit(() => {
            provider!.openFile(nodes || [node]);
        });
    });

    commands.registerCommand(COMMAND_NAMESPACE + '.discardChanges', (node, nodes) => {
        runAfterInit(() => {
            provider!.discardChanges(nodes || [node]);
        });
    });

    commands.registerCommand(COMMAND_NAMESPACE + '.discardAllChanges', () => {
        runAfterInit(() => {
            provider!.discardAllChanges();
        });
    });

    commands.registerCommand(COMMAND_NAMESPACE + '.changeRepository', () => {
        runAfterInit(() => {
            provider!.promptChangeRepository();
        });
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.changeBase', () => {
        runAfterInit(() => {
            provider!.promptChangeBase();
        });
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.refresh', () => {
        runAfterInit(() => {
            provider!.manualRefresh();
        });
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.openAllChanges', node => {
        runAfterInit(() => provider!.openAllChanges(node));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.openChangedFiles', node => {
        runAfterInit(() => provider!.openChangedFiles(node));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.switchToFullDiff', () => {
        runAfterInit(() => provider!.switchToFullDiff());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.switchToMergeDiff', () => {
        runAfterInit(() => provider!.switchToMergeDiff());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.showCheckboxes', () => {
        runAfterInit(() => provider!.hideCheckboxes(false));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.hideCheckboxes', () => {
        runAfterInit(() => provider!.hideCheckboxes(true));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.viewAsList', () => {
        runAfterInit(() => provider!.viewAsTree(false));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.viewAsTree', () => {
        runAfterInit(() => provider!.viewAsTree(true));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.searchChanges', () => {
        runAfterInit(() => provider!.searchChanges());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.filterFiles', () => {
        runAfterInit(() => provider!.filterFiles());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.clearFilter', () => {
        runAfterInit(() => provider!.clearFilter());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.copyPath', node => {
        runAfterInit(() => provider!.copyPath(node));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.copyRelativePath', node => {
        runAfterInit(() => provider!.copyRelativePath(node));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.sortByName', () => {
        runAfterInit(() => provider!.sortByName());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.sortByPath', () => {
        runAfterInit(() => provider!.sortByPath());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.sortByStatus', () => {
        runAfterInit(() => provider!.sortByStatus());
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.sortByRecentlyModified', () => {
        runAfterInit(() => provider!.sortByRecentlyModified());
    });

    commands.registerCommand(COMMAND_NAMESPACE + '.openChangesWithDifftool', node => {
        runAfterInit(() => provider!.openChangesWithDifftool(node));
    });
    commands.registerCommand(COMMAND_NAMESPACE + '.openCommentLocation', entry => {
        runAfterInit(() => provider!.openCommentLocation(entry));
    });

    createGit(gitApi, outputChannel).then(async git => {
        const onOutput = (str: string) => outputChannel.append(str);
        git.onOutput.addListener('log', onOutput);
        disposables.push(toDisposable(() => git.onOutput.removeListener('log', onOutput)));

        // Set initial context for menu enablement (starts in tree view mode)
        commands.executeCommand('setContext', CONTEXT_NAMESPACE + '.viewAsList', false);
        commands.executeCommand('setContext', CONTEXT_NAMESPACE + '.isFiltered', false);

        provider = new GitTreeCompareProvider(git, gitApi, outputChannel, context.globalState, context.asAbsolutePath);

        const treeView = window.createTreeView(
            VIEW_ID,
            {
                treeDataProvider: provider,
                canSelectMany: true,
            }
        );

        provider.init(treeView, onSelectedSelectionChange);
    });
}
