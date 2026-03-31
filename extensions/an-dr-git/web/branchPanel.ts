/**
 * Implements the branch list panel shown as a left sidebar in the Git Graph View.
 * Provides the same public interface as a multi-select Dropdown for branch selection.
 */
class BranchPanel {
	private readonly changeCallback: (values: string[]) => void;
	private options: ReadonlyArray<DropdownOption> = [];
	private optionsSelected: boolean[] = [];
	private filterValue: string = '';
	private localCollapsed: boolean = false;
	private remoteCollapsed: boolean = false;

	private readonly filterInput: HTMLInputElement;
	private readonly listElem: HTMLElement;

	constructor(id: string, changeCallback: (values: string[]) => void) {
		this.changeCallback = changeCallback;
		const elem = document.getElementById(id)!;

		const filterWrapper = elem.appendChild(document.createElement('div'));
		filterWrapper.className = 'branchPanelFilter';
		this.filterInput = filterWrapper.appendChild(document.createElement('input'));
		this.filterInput.className = 'branchPanelFilterInput';
		this.filterInput.placeholder = 'Filter branches...';
		this.filterInput.addEventListener('input', () => {
			this.filterValue = this.filterInput.value.toLowerCase();
			this.render();
		});

		this.listElem = elem.appendChild(document.createElement('div'));
		this.listElem.className = 'branchPanelList';
		this.listElem.addEventListener('click', (e) => {
			const sectionHeader = (<HTMLElement>e.target).closest('.branchPanelSectionHeader') as HTMLElement | null;
			const item = (<HTMLElement>e.target).closest('.branchPanelItem') as HTMLElement | null;
			if (sectionHeader !== null) {
				const section = sectionHeader.dataset.section;
				if (section === 'local') this.localCollapsed = !this.localCollapsed;
				else if (section === 'remote') this.remoteCollapsed = !this.remoteCollapsed;
				this.render();
			} else if (item !== null && typeof item.dataset.id !== 'undefined') {
				this.onItemClick(parseInt(item.dataset.id));
			}
		});
	}

	public setOptions(options: ReadonlyArray<DropdownOption>, optionsSelected: string[]) {
		this.options = options;
		this.optionsSelected = [];
		let selectedOption = -1;
		for (let i = 0; i < options.length; i++) {
			const isSelected = optionsSelected.includes(options[i].value);
			this.optionsSelected[i] = isSelected;
			if (isSelected) selectedOption = i;
		}
		if (selectedOption === -1) {
			this.optionsSelected[0] = true;
		}
		this.render();
	}

	public isSelected(value: string) {
		if (this.options.length > 0) {
			if (this.optionsSelected[0]) return true;
			const idx = this.options.findIndex((o) => o.value === value);
			if (idx > -1 && this.optionsSelected[idx]) return true;
		}
		return false;
	}

	public selectOption(value: string) {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx > -1 && !this.optionsSelected[0] && !this.optionsSelected[idx]) {
			this.optionsSelected[idx] = true;
			this.render();
			this.changeCallback(this.getSelectedValues());
		}
	}

	public unselectOption(value: string) {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx > -1 && (this.optionsSelected[0] || this.optionsSelected[idx])) {
			if (this.optionsSelected[0]) {
				this.optionsSelected[0] = false;
				for (let i = 1; i < this.optionsSelected.length; i++) this.optionsSelected[i] = true;
			}
			this.optionsSelected[idx] = false;
			if (this.optionsSelected.every((s) => !s)) this.optionsSelected[0] = true;
			this.render();
			this.changeCallback(this.getSelectedValues());
		}
	}

	public refresh() {
		if (this.options.length > 0) this.render();
	}

	public isOpen() { return false; }
	public close() { /* no-op: sidebar is always visible */ }

	private getSelectedValues(): string[] {
		if (this.optionsSelected[0]) return [this.options[0].value];
		return this.options.filter((_, i) => this.optionsSelected[i]).map((o) => o.value);
	}

	private onItemClick(idx: number) {
		if (idx === 0) {
			if (!this.optionsSelected[0]) {
				this.optionsSelected[0] = true;
				for (let i = 1; i < this.optionsSelected.length; i++) this.optionsSelected[i] = false;
				this.render();
				this.changeCallback(this.getSelectedValues());
			}
		} else {
			if (this.optionsSelected[0]) this.optionsSelected[0] = false;
			this.optionsSelected[idx] = !this.optionsSelected[idx];
			if (this.optionsSelected.every((s) => !s)) this.optionsSelected[0] = true;
			this.render();
			this.changeCallback(this.getSelectedValues());
		}
	}

	private render() {
		const locals: { opt: DropdownOption; idx: number }[] = [];
		const remotes: { opt: DropdownOption; idx: number }[] = [];
		const globs: { opt: DropdownOption; idx: number }[] = [];

		for (let i = 1; i < this.options.length; i++) {
			const opt = this.options[i];
			if (opt.name.startsWith('Glob: ')) {
				globs.push({ opt, idx: i });
			} else if (opt.value.startsWith('remotes/')) {
				remotes.push({ opt, idx: i });
			} else {
				locals.push({ opt, idx: i });
			}
		}

		const filter = this.filterValue;
		let html = '';

		// Show All
		const showAllVisible = filter === '' || 'show all'.indexOf(filter) > -1;
		if (showAllVisible) {
			html += this.itemHtml(0, this.options[0].name, this.optionsSelected[0]);
		}

		// Glob patterns
		if (globs.length > 0) {
			const visibleGlobs = globs.filter((g) => filter === '' || g.opt.name.toLowerCase().indexOf(filter) > -1);
			if (visibleGlobs.length > 0) {
				html += '<div class="branchPanelSectionHeader" data-section="globs"><span class="branchPanelArrow">&#9660;</span>Glob Patterns</div>';
				for (let i = 0; i < visibleGlobs.length; i++) {
					html += this.itemHtml(visibleGlobs[i].idx, visibleGlobs[i].opt.name, this.optionsSelected[visibleGlobs[i].idx]);
				}
			}
		}

		// Local branches
		const visibleLocals = locals.filter((l) => filter === '' || l.opt.name.toLowerCase().indexOf(filter) > -1);
		html += '<div class="branchPanelSectionHeader' + (this.localCollapsed ? ' collapsed' : '') + '" data-section="local">' +
			'<span class="branchPanelArrow">' + (this.localCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
			'Local (' + locals.length + ')</div>';
		if (!this.localCollapsed) {
			if (visibleLocals.length > 0) {
				for (let i = 0; i < visibleLocals.length; i++) {
					html += this.itemHtml(visibleLocals[i].idx, visibleLocals[i].opt.name, this.optionsSelected[visibleLocals[i].idx]);
				}
			} else if (filter !== '') {
				html += '<div class="branchPanelNoResults">No matches</div>';
			}
		}

		// Remote branches
		if (remotes.length > 0) {
			const visibleRemotes = remotes.filter((r) => filter === '' || r.opt.name.toLowerCase().indexOf(filter) > -1);
			html += '<div class="branchPanelSectionHeader' + (this.remoteCollapsed ? ' collapsed' : '') + '" data-section="remote">' +
				'<span class="branchPanelArrow">' + (this.remoteCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
				'Remote (' + remotes.length + ')</div>';
			if (!this.remoteCollapsed) {
				if (visibleRemotes.length > 0) {
					for (let i = 0; i < visibleRemotes.length; i++) {
						html += this.itemHtml(visibleRemotes[i].idx, visibleRemotes[i].opt.name, this.optionsSelected[visibleRemotes[i].idx]);
					}
				} else if (filter !== '') {
					html += '<div class="branchPanelNoResults">No matches</div>';
				}
			}
		}

		this.listElem.innerHTML = html;
	}

	private itemHtml(idx: number, name: string, selected: boolean) {
		return '<div class="branchPanelItem' + (selected ? ' selected' : '') + '" data-id="' + idx + '" title="' + escapeHtml(name) + '">' +
			'<span class="branchPanelCheck">' + (selected ? SVG_ICONS.check : '') + '</span>' +
			'<span class="branchPanelItemName">' + escapeHtml(name) + '</span>' +
			'</div>';
	}
}
