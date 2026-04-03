/* Table resize helpers extracted from CommitsView */

function commitsApplyColumnWidths(view: any, cols: HTMLCollectionOf<HTMLElement>, columnWidths: GG.ColumnWidth[]) {
	cols[0].style.width = columnWidths[0] + 'px';
	cols[0].style.padding = '';
	for (let i = 2; i < cols.length; i++) {
		cols[i].style.width = columnWidths[parseInt(cols[i].dataset.col!)] + 'px';
	}
	view.tableElem.className = 'fixedLayout';
	view.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
	view.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
}

function commitsInitColumnDrag(view: any, cols: HTMLCollectionOf<HTMLElement>, columnWidths: GG.ColumnWidth[]) {
	let mouseX = -1, col = -1, colIndex = -1;

	const processResizingColumn: EventListener = (e) => {
		if (col > -1) {
			let mouseEvent = <MouseEvent>e;
			let mouseDeltaX = mouseEvent.clientX - mouseX;

			if (col === 0) {
				if (columnWidths[0] + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -columnWidths[0] + COLUMN_MIN_WIDTH;
				if (cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - COLUMN_MIN_WIDTH;
				columnWidths[0] += mouseDeltaX;
				cols[0].style.width = columnWidths[0] + 'px';
				view.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
			} else {
				let colWidth = col !== 1 ? columnWidths[col] : cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
				let nextCol = col + 1;
				while (columnWidths[nextCol] === COLUMN_HIDDEN) nextCol++;

				if (colWidth + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -colWidth + COLUMN_MIN_WIDTH;
				if (columnWidths[nextCol] - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = columnWidths[nextCol] - COLUMN_MIN_WIDTH;
				if (col !== 1) {
					columnWidths[col] += mouseDeltaX;
					cols[colIndex].style.width = columnWidths[col] + 'px';
				}
				columnWidths[nextCol] -= mouseDeltaX;
				cols[colIndex + 1].style.width = columnWidths[nextCol] + 'px';
			}
			mouseX = mouseEvent.clientX;
			view.updateCommittedColumnDisplayMode();
		}
	};
	const stopResizingColumn: EventListener = () => {
		if (col > -1) {
			col = -1;
			colIndex = -1;
			mouseX = -1;
			eventOverlay.remove();
			view.saveColumnWidths(columnWidths);
			view.updateCommittedColumnDisplayMode();
		}
	};

	addListenerToClass('resizeCol', 'mousedown', (e) => {
		if (e.target === null) return;
		col = parseInt((<HTMLElement>e.target).dataset.col!);
		while (columnWidths[col] === COLUMN_HIDDEN) col--;
		mouseX = (<MouseEvent>e).clientX;

		let isAuto = columnWidths[0] === COLUMN_AUTO;
		for (let i = 0; i < cols.length; i++) {
			let curCol = parseInt(cols[i].dataset.col!);
			if (isAuto && curCol !== 1) columnWidths[curCol] = cols[i].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
			if (curCol === col) colIndex = i;
		}
		if (isAuto) commitsApplyColumnWidths(view, cols, columnWidths);
		eventOverlay.create('colResize', processResizingColumn, stopResizingColumn);
	});
}

function commitsMakeTableResizable(view: any) {
	let colHeadersElem = document.getElementById('tableColHeaders')!, cols = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('tableColHeader');
	let columnWidths: GG.ColumnWidth[];

	for (let i = 0; i < cols.length; i++) {
		let col = parseInt(cols[i].dataset.col!);
		cols[i].innerHTML += (i > 0 ? '<span class="resizeCol left" data-col="' + (col - 1) + '"></span>' : '') + (i < cols.length - 1 ? '<span class="resizeCol right" data-col="' + col + '"></span>' : '');
	}

	let cWidths = view.gitRepos[view.currentRepo].columnWidths;
	if (cWidths === null || cWidths.length === 0) {
		columnWidths = [COLUMN_AUTO, COLUMN_AUTO, COLUMN_AUTO, COLUMN_AUTO];
		view.saveColumnWidths(columnWidths);
	} else if (cWidths.length >= 4) {
		const dateWidth = cWidths[1], authorWidth = cWidths[2];
		let committedWidth = COLUMN_AUTO;
		if (dateWidth > 0 || authorWidth > 0) {
			committedWidth = Math.max(dateWidth > 0 ? dateWidth : 0, authorWidth > 0 ? authorWidth : 0);
		}
		columnWidths = [cWidths[0] > COLUMN_HIDDEN ? cWidths[0] : COLUMN_AUTO, COLUMN_AUTO, committedWidth, cWidths[3] > COLUMN_HIDDEN ? cWidths[3] : COLUMN_AUTO];
		view.saveColumnWidths(columnWidths);
	} else {
		columnWidths = [
			cWidths[0] > COLUMN_HIDDEN ? cWidths[0] : COLUMN_AUTO,
			COLUMN_AUTO,
			cWidths[1] > COLUMN_HIDDEN ? cWidths[1] : COLUMN_AUTO,
			cWidths[2] > COLUMN_HIDDEN ? cWidths[2] : COLUMN_AUTO
		];
	}
	const initialColVis = view.getColumnVisibility();
	if (!initialColVis.committed) columnWidths[2] = COLUMN_HIDDEN;
	if (!initialColVis.id) columnWidths[3] = COLUMN_HIDDEN;

	if (columnWidths[0] !== COLUMN_AUTO) {
		commitsApplyColumnWidths(view, cols, columnWidths);
	} else {
		view.tableElem.className = 'autoLayout';

		let colWidth = cols[0].offsetWidth, graphWidth = view.graph.getContentWidth();
		let maxWidth = Math.round(view.viewElem.clientWidth * 0.333);
		if (Math.max(graphWidth, colWidth) > maxWidth) {
			view.graph.limitMaxWidth(maxWidth);
			graphWidth = maxWidth;
			view.tableElem.className += ' limitGraphWidth';
			view.tableElem.style.setProperty(CSS_PROP_LIMIT_GRAPH_WIDTH, maxWidth + 'px');
		} else {
			view.graph.limitMaxWidth(-1);
			view.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
		}

		if (colWidth < Math.max(graphWidth, 64)) {
			cols[0].style.padding = '6px ' + Math.floor((Math.max(graphWidth, 64) - (colWidth - COLUMN_LEFT_RIGHT_PADDING)) / 2) + 'px';
		}
	}

	commitsInitColumnDrag(view, cols, columnWidths);

	const colVis = view.getColumnVisibility();
	colHeadersElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		const toggleColumnVisibility = (column: 'committed' | 'id') => {
			const currentVisibility = view.getColumnVisibility();
			const visibility = column === 'committed'
				? { committed: !currentVisibility.committed, id: currentVisibility.id }
				: { committed: currentVisibility.committed, id: !currentVisibility.id };
			(<GG.DeepWriteable<Config>>view.config).commitsColumnVisibility = visibility;
			sendMessage({ command: 'setColumnVisibility', visibility: visibility });
			view.render();
		};
		const commitOrdering = getCommitOrdering(view.gitRepos[view.currentRepo].commitOrdering);
		const changeCommitOrdering = (repoCommitOrdering: GG.RepoCommitOrdering) => {
			view.saveRepoStateValue(view.currentRepo, 'commitOrdering', repoCommitOrdering);
			view.refresh(true);
		};
		contextMenu.show([[
			{ title: 'Committed', visible: true, checked: colVis.committed, onClick: () => toggleColumnVisibility('committed') },
			{ title: 'ID', visible: true, checked: colVis.id, onClick: () => toggleColumnVisibility('id') }
		], [
			{ title: 'Commit Timestamp Order', visible: true, checked: commitOrdering === GG.CommitOrdering.Date, onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Date) },
			{ title: 'Author Timestamp Order', visible: true, checked: commitOrdering === GG.CommitOrdering.AuthorDate, onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.AuthorDate) },
			{ title: 'Topological Order', visible: true, checked: commitOrdering === GG.CommitOrdering.Topological, onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Topological) }
		]], true, null, e, view.viewElem);
	});

	view.updateCommittedColumnDisplayMode();
}
