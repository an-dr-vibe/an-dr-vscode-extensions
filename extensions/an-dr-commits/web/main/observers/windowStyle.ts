/* Window/style observer helpers extracted from CommitsView */

function commitsObserveWindowSizeChanges(view: any) {
	let windowWidth = window.outerWidth, windowHeight = window.outerHeight;
	window.addEventListener('resize', () => {
		view.updateControlsLayout();
		view.updateCommittedColumnDisplayMode();
		view.collapseReferenceBadgesToFit();
		view.updateRepoInProgressBannerOffset();
		if (windowWidth === window.outerWidth && windowHeight === window.outerHeight) {
			view.renderGraph();
		} else {
			windowWidth = window.outerWidth;
			windowHeight = window.outerHeight;
		}
	});
}

function commitsObserveWebviewStyleChanges(view: any) {
	let fontFamily = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
		editorFontFamily = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
		findMatchColour = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
		selectionBackgroundColor = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

	const setFlashColour = (colour: string) => {
		document.body.style.setProperty('--an-dr-commits-flashPrimary', modifyColourOpacity(colour, 0.7));
		document.body.style.setProperty('--an-dr-commits-flashSecondary', modifyColourOpacity(colour, 0.5));
	};
	const setSelectionBackgroundColorExists = () => {
		alterClass(document.body, 'selection-background-color-exists', selectionBackgroundColor);
	};

	view.findWidget.setColour(findMatchColour);
	setFlashColour(findMatchColour);
	setSelectionBackgroundColorExists();

	(new MutationObserver(() => {
		let ff = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
			eff = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
			fmc = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
			sbc = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

		if (ff !== fontFamily || eff !== editorFontFamily) {
			fontFamily = ff;
			editorFontFamily = eff;
			view.repoDropdown.refresh();
			view.branchDropdown.refresh();
		}
		if (fmc !== findMatchColour) {
			findMatchColour = fmc;
			view.findWidget.setColour(findMatchColour);
			setFlashColour(findMatchColour);
		}
		if (selectionBackgroundColor !== sbc) {
			selectionBackgroundColor = sbc;
			setSelectionBackgroundColorExists();
		}
	})).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

function commitsObserveViewScroll(view: any) {
	let active = view.viewElem.scrollTop > 0, timeout: NodeJS.Timer | null = null;
	view.scrollShadowElem.className = active ? CLASS_ACTIVE : '';
	view.viewElem.addEventListener('scroll', () => {
		const scrollTop = view.viewElem.scrollTop;
		if (active !== scrollTop > 0) {
			active = scrollTop > 0;
			view.scrollShadowElem.className = active ? CLASS_ACTIVE : '';
		}

		if (view.config.loadMoreCommitsAutomatically && view.moreCommitsAvailable && !view.currentRepoRefreshState.inProgress) {
			const viewHeight = view.viewElem.clientHeight, contentHeight = view.viewElem.scrollHeight;
			if (scrollTop > 0 && viewHeight > 0 && contentHeight > 0 && (scrollTop + viewHeight) >= contentHeight - 25) {
				view.loadMoreCommits();
			}
		}

		if (timeout !== null) clearTimeout(timeout);
		timeout = setTimeout(() => {
			view.scrollTop = scrollTop;
			view.saveState();
			timeout = null;
		}, 250);
	});
}
