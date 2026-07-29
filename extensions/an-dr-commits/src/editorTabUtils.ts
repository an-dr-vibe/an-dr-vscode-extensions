export function isMatchingWebviewTab(tab: any, viewTypes: ReadonlySet<string>, label: string) {
	const input = tab && tab.input;
	const viewType = input && typeof input.viewType === 'string' ? input.viewType : '';
	return viewTypes.has(viewType) || tab?.label === label;
}

export function getMatchingTabs(tabGroups: any, isMatchingTab: (tab: any) => boolean): any[] {
	const groups = Array.isArray(tabGroups?.all) ? tabGroups.all : [];
	const matchingTabs: any[] = [];

	for (const group of groups) {
		const tabs = Array.isArray(group?.tabs) ? group.tabs : [];
		for (const tab of tabs) {
			if (isMatchingTab(tab)) {
				matchingTabs.push(tab);
			}
		}
	}

	return matchingTabs;
}
