import { getDuplicateTabsToClose, getMatchingTabs, isMatchingWebviewTab } from '../src/tabUtils';

describe('tabUtils', () => {
	const viewTypes = new Set(['an-dr-commits', 'mainThreadWebview-an-dr-commits']);

	it('Matches Commits tabs by view type', () => {
		expect(isMatchingWebviewTab({ input: { viewType: 'an-dr-commits' }, label: 'Other' }, viewTypes, 'Commits')).toBe(true);
		expect(isMatchingWebviewTab({ input: { viewType: 'mainThreadWebview-an-dr-commits' }, label: 'Other' }, viewTypes, 'Commits')).toBe(true);
	});

	it('Matches Commits tabs by label when view type metadata is unavailable', () => {
		expect(isMatchingWebviewTab({ label: 'Commits' }, viewTypes, 'Commits')).toBe(true);
		expect(isMatchingWebviewTab({ label: 'Other' }, viewTypes, 'Commits')).toBe(false);
	});

	it('Collects matching tabs across tab groups', () => {
		const matchingTabs = getMatchingTabs({
			all: [
				{ tabs: [{ label: 'Commits' }, { label: 'Other' }] },
				{ tabs: [{ input: { viewType: 'an-dr-commits' }, label: 'Ignored' }] }
			]
		}, (tab) => isMatchingWebviewTab(tab, viewTypes, 'Commits'));

		expect(matchingTabs).toHaveLength(2);
	});

	it('Returns duplicate Commits tabs when the active tab is Commits', () => {
		const activeTab = { label: 'Commits' };
		const duplicateTab = { input: { viewType: 'an-dr-commits' }, label: 'Commits' };

		const duplicates = getDuplicateTabsToClose({
			all: [
				{ tabs: [activeTab] },
				{ tabs: [duplicateTab] }
			],
			activeTabGroup: {
				activeTab
			}
		}, (tab) => isMatchingWebviewTab(tab, viewTypes, 'Commits'));

		expect(duplicates).toStrictEqual([duplicateTab]);
	});

	it('Does not close anything when Commits is not the active tab', () => {
		const duplicates = getDuplicateTabsToClose({
			all: [
				{ tabs: [{ label: 'Commits' }] },
				{ tabs: [{ input: { viewType: 'an-dr-commits' }, label: 'Commits' }] }
			],
			activeTabGroup: {
				activeTab: { label: 'Readme' }
			}
		}, (tab) => isMatchingWebviewTab(tab, viewTypes, 'Commits'));

		expect(duplicates).toStrictEqual([]);
	});
});
