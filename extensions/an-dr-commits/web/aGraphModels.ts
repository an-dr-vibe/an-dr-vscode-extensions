const CLASS_GRAPH_VERTEX_ACTIVE = 'graphVertexActive';
const NULL_VERTEX_ID = -1;
const GRAPH_VERTEX_RADIUS = '4.4';
const GRAPH_CURRENT_VERTEX_RADIUS = '4.9';
const GRAPH_STASH_OUTER_RADIUS = '4.9';
const GRAPH_STASH_INNER_RADIUS = '2.2';
const GRAPH_VERTEX_TOOLTIP_RADIUS = '5';
const GRAPH_CURRENT_VERTEX_TOOLTIP_RADIUS = '5.5';
const GRAPH_STASH_OUTER_TOOLTIP_RADIUS = '5.5';

interface Point {
	readonly x: number;
	readonly y: number;
}

interface Line {
	readonly p1: Point;
	readonly p2: Point;
	readonly lockedFirst: boolean;
}

interface Pixel {
	x: number;
	y: number;
}

interface PlacedLine {
	readonly p1: Pixel;
	readonly p2: Pixel;
	readonly isCommitted: boolean;
	readonly lockedFirst: boolean;
}

interface UnavailablePoint {
	readonly connectsTo: VertexOrNull;
	readonly onBranch: Branch;
}

type VertexOrNull = Vertex | null;

class Branch {
	private readonly colour: number;
	private end: number = 0;
	private lines: Line[] = [];
	private numUncommitted: number = 0;

	constructor(colour: number) {
		this.colour = colour;
	}

	public addLine(p1: Point, p2: Point, isCommitted: boolean, lockedFirst: boolean) {
		this.lines.push({ p1, p2, lockedFirst });
		if (isCommitted) {
			if (p2.x === 0 && p2.y < this.numUncommitted) this.numUncommitted = p2.y;
		} else {
			this.numUncommitted++;
		}
	}

	public getColour() {
		return this.colour;
	}

	public getEnd() {
		return this.end;
	}

	public setEnd(end: number) {
		this.end = end;
	}

	public draw(svg: SVGElement, config: GG.GraphConfig, expandAt: number) {
		let colour = config.colours[this.colour % config.colours.length], i, x1, y1, x2, y2, lines: PlacedLine[] = [], curPath = '', d = config.grid.y * (config.style === GG.GraphStyle.Angular ? 0.38 : 0.8), line, nextLine;
		for (i = 0; i < this.lines.length; i++) {
			line = this.lines[i];
			x1 = line.p1.x * config.grid.x + config.grid.offsetX; y1 = line.p1.y * config.grid.y + config.grid.offsetY;
			x2 = line.p2.x * config.grid.x + config.grid.offsetX; y2 = line.p2.y * config.grid.y + config.grid.offsetY;
			if (expandAt > -1) {
				if (line.p1.y > expandAt) {
					y1 += config.grid.expandY;
					y2 += config.grid.expandY;
				} else if (line.p2.y > expandAt) {
					if (x1 === x2) {
						y2 += config.grid.expandY;
					} else if (line.lockedFirst) {
						lines.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
						lines.push({ p1: { x: x2, y: y1 + config.grid.y }, p2: { x: x2, y: y2 + config.grid.expandY }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
						continue;
					} else {
						lines.push({ p1: { x: x1, y: y1 }, p2: { x: x1, y: y2 - config.grid.y + config.grid.expandY }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
						y1 += config.grid.expandY; y2 += config.grid.expandY;
					}
				}
			}
			lines.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, isCommitted: i >= this.numUncommitted, lockedFirst: line.lockedFirst });
		}

		i = 0;
		while (i < lines.length - 1) {
			line = lines[i];
			nextLine = lines[i + 1];
			if (line.p1.x === line.p2.x && line.p2.x === nextLine.p1.x && nextLine.p1.x === nextLine.p2.x && line.p2.y === nextLine.p1.y && line.isCommitted === nextLine.isCommitted) {
				line.p2.y = nextLine.p2.y;
				lines.splice(i + 1, 1);
			} else {
				i++;
			}
		}

		for (i = 0; i < lines.length; i++) {
			line = lines[i];
			x1 = line.p1.x; y1 = line.p1.y;
			x2 = line.p2.x; y2 = line.p2.y;
			if (curPath !== '' && i > 0 && line.isCommitted !== lines[i - 1].isCommitted) {
				Branch.drawPath(svg, curPath, lines[i - 1].isCommitted, colour, config.uncommittedChanges);
				curPath = '';
			}
			if (curPath === '' || (i > 0 && (x1 !== lines[i - 1].p2.x || y1 !== lines[i - 1].p2.y))) curPath += 'M' + x1.toFixed(0) + ',' + y1.toFixed(1);
			if (x1 === x2) {
				curPath += 'L' + x2.toFixed(0) + ',' + y2.toFixed(1);
			} else if (config.style === GG.GraphStyle.Angular) {
				curPath += 'L' + (line.lockedFirst ? (x2.toFixed(0) + ',' + (y2 - d).toFixed(1)) : (x1.toFixed(0) + ',' + (y1 + d).toFixed(1))) + 'L' + x2.toFixed(0) + ',' + y2.toFixed(1);
			} else {
				curPath += 'C' + x1.toFixed(0) + ',' + (y1 + d).toFixed(1) + ' ' + x2.toFixed(0) + ',' + (y2 - d).toFixed(1) + ' ' + x2.toFixed(0) + ',' + y2.toFixed(1);
			}
		}

		if (curPath !== '') Branch.drawPath(svg, curPath, lines[lines.length - 1].isCommitted, colour, config.uncommittedChanges);
	}

	private static drawPath(svg: SVGElement, path: string, isCommitted: boolean, colour: string, uncommittedChanges: GG.GraphUncommittedChangesStyle) {
		const shadow = svg.appendChild(document.createElementNS(SVG_NAMESPACE, 'path')), line = svg.appendChild(document.createElementNS(SVG_NAMESPACE, 'path'));
		shadow.setAttribute('class', 'shadow');
		shadow.setAttribute('d', path);
		line.setAttribute('class', 'line');
		line.setAttribute('d', path);
		line.setAttribute('stroke', isCommitted ? colour : '#808080');
		if (!isCommitted && uncommittedChanges === GG.GraphUncommittedChangesStyle.OpenCircleAtTheCheckedOutCommit) line.setAttribute('stroke-dasharray', '2px');
	}
}

class Vertex {
	public readonly id: number;
	public readonly isStash: boolean;
	private x: number = 0;
	private children: Vertex[] = [];
	private parents: Vertex[] = [];
	private nextParent: number = 0;
	private onBranch: Branch | null = null;
	private isCommitted: boolean = true;
	private isCurrent: boolean = false;
	private nextX: number = 0;
	private connections: UnavailablePoint[] = [];

	constructor(id: number, isStash: boolean) {
		this.id = id;
		this.isStash = isStash;
	}

	public addChild(vertex: Vertex) { this.children.push(vertex); }
	public getChildren(): ReadonlyArray<Vertex> { return this.children; }
	public addParent(vertex: Vertex) { this.parents.push(vertex); }
	public getParents(): ReadonlyArray<Vertex> { return this.parents; }
	public hasParents() { return this.parents.length > 0; }
	public getNextParent(): Vertex | null { return this.nextParent < this.parents.length ? this.parents[this.nextParent] : null; }
	public getLastParent(): Vertex | null { return this.nextParent < 1 ? null : this.parents[this.nextParent - 1]; }
	public registerParentProcessed() { this.nextParent++; }
	public isMerge() { return this.parents.length > 1; }
	public addToBranch(branch: Branch, x: number) { if (this.onBranch === null) { this.onBranch = branch; this.x = x; } }
	public isNotOnBranch() { return this.onBranch === null; }
	public isOnThisBranch(branch: Branch) { return this.onBranch === branch; }
	public getBranch() { return this.onBranch; }
	public getPoint(): Point { return { x: this.x, y: this.id }; }
	public getNextPoint(): Point { return { x: this.nextX, y: this.id }; }
	public getNextX(): number { return this.nextX; }

	public getPointConnectingTo(vertex: VertexOrNull, onBranch: Branch) {
		for (let i = 0; i < this.connections.length; i++) {
			if (this.connections[i].connectsTo === vertex && this.connections[i].onBranch === onBranch) return { x: i, y: this.id };
		}
		return null;
	}

	public registerUnavailablePoint(x: number, connectsToVertex: VertexOrNull, onBranch: Branch) {
		if (x === this.nextX) {
			this.nextX = x + 1;
			this.connections[x] = { connectsTo: connectsToVertex, onBranch };
		}
	}

	public getColour() { return this.onBranch !== null ? this.onBranch.getColour() : 0; }
	public getIsCommitted() { return this.isCommitted; }
	public setNotCommitted() { this.isCommitted = false; }
	public setCurrent() { this.isCurrent = true; }

	public draw(svg: SVGElement, config: GG.GraphConfig, expandOffset: boolean, overListener: (event: MouseEvent) => void, outListener: (event: MouseEvent) => void, rebaseKind: string | null = null) {
		if (this.onBranch === null) return;
		const colour = this.isCommitted ? config.colours[this.onBranch.getColour() % config.colours.length] : '#808080';
		const cx = (this.x * config.grid.x + config.grid.offsetX).toString();
		const cy = (this.id * config.grid.y + config.grid.offsetY + (expandOffset ? config.grid.expandY : 0)).toString();

		if (rebaseKind !== null) {
			const ring = document.createElementNS(SVG_NAMESPACE, 'circle');
			ring.setAttribute('cx', cx);
			ring.setAttribute('cy', cy);
			ring.setAttribute('r', '7');
			ring.setAttribute('class', 'rebaseRing ' + rebaseKind);
			svg.appendChild(ring);
		}

		const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
		circle.dataset.id = this.id.toString();
		circle.setAttribute('cx', cx);
		circle.setAttribute('cy', cy);
		circle.setAttribute('r', this.isCurrent ? GRAPH_CURRENT_VERTEX_RADIUS : GRAPH_VERTEX_RADIUS);
		if (this.isCurrent) {
			circle.setAttribute('class', 'current');
			circle.setAttribute('stroke', colour);
		} else {
			circle.setAttribute('fill', colour);
		}
		svg.appendChild(circle);

		if (this.isStash && !this.isCurrent) {
			circle.setAttribute('r', GRAPH_STASH_OUTER_RADIUS);
			circle.setAttribute('class', 'stashOuter');
			const innerCircle = document.createElementNS(SVG_NAMESPACE, 'circle');
			innerCircle.setAttribute('cx', cx);
			innerCircle.setAttribute('cy', cy);
			innerCircle.setAttribute('r', GRAPH_STASH_INNER_RADIUS);
			innerCircle.setAttribute('class', 'stashInner');
			svg.appendChild(innerCircle);
		}

		circle.addEventListener('mouseover', overListener);
		circle.addEventListener('mouseout', outListener);
	}
}
