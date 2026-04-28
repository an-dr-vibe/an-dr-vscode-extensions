/**
 * FilesPanel — persistent right sidebar showing changed files for the selected commit.
 * Mirrors the BranchPanel pattern for layout management.
 */
class FilesPanel {
	private readonly panel: HTMLElement;
	private readonly headerElem: HTMLElement;
	private readonly contentElem: HTMLElement;
	private readonly toggleBtn: HTMLElement;
	private panelHidden: boolean;
	private panelWidth: number;
	private scrollTop: number = 0;
	private onScroll: () => void = () => {};

	constructor() {
		this.panelHidden = globalState.filesPanelHidden;
		this.panelWidth = globalState.filesPanelWidth;

		this.panel = document.getElementById('filesPanel')!;

		// Resize handle on the left edge
		const resizeHandle = document.createElement('div');
		resizeHandle.id = 'filesPanelResizeHandle';
		this.panel.appendChild(resizeHandle);
		this.setupResize(resizeHandle);

		// Header bar (populated by Commit Details View when a commit is expanded)
		this.headerElem = document.createElement('div');
		this.headerElem.id = 'filesPanelHeader';
		this.panel.appendChild(this.headerElem);

		// Scrollable content area
		this.contentElem = document.createElement('div');
		this.contentElem.id = 'filesPanelContent';
		this.panel.appendChild(this.contentElem);

		this.contentElem.addEventListener('scroll', () => {
			this.scrollTop = this.contentElem.scrollTop;
			this.onScroll();
		});

		// Toggle button in the toolbar
		this.toggleBtn = document.createElement('div');
		this.toggleBtn.id = 'filesPanelToggle';
		this.toggleBtn.title = 'Toggle Files Panel';
		this.toggleBtn.innerHTML = SVG_ICONS.filesPanel;
		const toggleBtnContainer = document.getElementById('filesPanelToggleBtn');
		if (toggleBtnContainer) {
			toggleBtnContainer.appendChild(this.toggleBtn);
		}
		this.toggleBtn.addEventListener('click', () => this.toggle());

		// Apply initial state
		this.applyInlineWidth(this.panelWidth);
		this.applyWidth(this.panelHidden ? 0 : this.panelWidth);
		if (this.panelHidden) {
			document.body.classList.add('filesPanelHidden');
		} else {
			this.toggleBtn.classList.add('active');
		}

		this.showPlaceholder();
	}

	private setupResize(handle: HTMLElement) {
		let startX = 0;
		let startWidth = 0;
		const onMove = (e: MouseEvent) => {
			const w = Math.max(140, Math.min(600, startWidth - (e.clientX - startX)));
			this.panelWidth = w;
			this.applyWidth(w);
			this.applyInlineWidth(w);
		};
		const onUp = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			updateGlobalViewState('filesPanelWidth', this.panelWidth);
		};
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			startX = e.clientX;
			startWidth = this.panelWidth;
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		});
	}

	private applyWidth(width: number) {
		document.body.style.setProperty('--files-panel-width', width + 'px');
	}

	private applyInlineWidth(width: number) {
		document.body.style.setProperty('--files-panel-inline-width', width + 'px');
	}

	private toggle() {
		this.panelHidden = !this.panelHidden;
		if (this.panelHidden) {
			document.body.classList.add('filesPanelHidden');
			this.applyWidth(0);
			this.toggleBtn.classList.remove('active');
		} else {
			document.body.classList.remove('filesPanelHidden');
			this.applyWidth(this.panelWidth);
			this.toggleBtn.classList.add('active');
		}
		const inlineContent = document.getElementById('commitDetailsViewInlineFilesContent');
		if (inlineContent !== null) {
			inlineContent.innerHTML = this.contentElem.innerHTML;
		}
		updateGlobalViewState('filesPanelHidden', this.panelHidden);
	}

	public setContentLoading() {
		this.contentElem.innerHTML = '<div class="filesPanelPlaceholder">Loading...</div>';
	}

	private showPlaceholder() {
		this.contentElem.innerHTML = '<div class="filesPanelPlaceholder">Select one or two commits to see the changed files</div>';
	}

	public update(fileTree: FileTreeFolder, fileChanges: ReadonlyArray<GG.GitFileChange>, contextMenuOpen: number, fileViewType: GG.FileViewType, isUncommitted: boolean) {
		const html = generateFileViewHtml(fileTree, fileChanges, contextMenuOpen, fileViewType, isUncommitted);
		this.contentElem.innerHTML = html;
		this.contentElem.scrollTop = this.scrollTop;
	}

	public getHeaderElem(): HTMLElement {
		return this.headerElem;
	}

	public clearHeader() {
		this.headerElem.innerHTML = '';
	}

	public clear() {
		this.scrollTop = 0;
		this.clearHeader();
		this.showPlaceholder();
	}

	public getScrollTop(): number {
		return this.scrollTop;
	}

	public setScrollTop(scrollTop: number) {
		this.scrollTop = scrollTop;
		this.contentElem.scrollTop = scrollTop;
	}

	public setOnScrollCallback(cb: () => void) {
		this.onScroll = cb;
	}

	public getContentElem(): HTMLElement {
		return this.contentElem;
	}

	public getContentHtml(): string {
		return this.contentElem.innerHTML;
	}

	public isHidden(): boolean {
		return this.panelHidden;
	}
}
