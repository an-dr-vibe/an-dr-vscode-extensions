export const COMMAND_IDS = [
	'an-dr-commits.view',
	'an-dr-commits.viewFromStatusBar',
	'an-dr-commits.addGitRepository',
	'an-dr-commits.removeGitRepository',
	'an-dr-commits.clearAvatarCache',
	'an-dr-commits.fetch',
	'an-dr-commits.pull',
	'an-dr-commits.push',
	'an-dr-commits.version',
	'an-dr-commits.openFile',
	'an-dr-commits.revealCommitInGraph'
] as const;

export type CommandId = typeof COMMAND_IDS[number];
