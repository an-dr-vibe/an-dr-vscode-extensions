import type { FullDiffData } from "./fullDiffRender";
import { renderFullDiff } from "./fullDiffRender";
import { escapeHtml } from "./utils/html";

/** Shortest and tallest the panel may be dragged, in pixels. */
const MIN_HEIGHT = 80;
const MAX_VIEWPORT_REMAINDER = 100;

/** Height used until the user drags the panel. */
export const DEFAULT_FULL_DIFF_HEIGHT = 260;

/**
 * Only the height is persisted. Which file was open is not: after a reload no
 * commit is expanded, so there would be nothing to show.
 */
export interface FullDiffPanelState {
  height: number;
}

/**
 * Bottom-docked panel showing one file's contents with its changes marked.
 *
 * The panel is closed until a file is picked, and reserves its height through
 * a CSS variable so the rest of the layout insets itself rather than needing
 * every neighbouring element repositioned from script.
 */
export class FullDiffPanel {
  private readonly panel: HTMLElement;
  private readonly filenameElem: HTMLElement;
  private readonly contentElem: HTMLElement;
  private readonly onStateChange: (state: FullDiffPanelState) => void;
  private height: number;
  private hidden = true;

  constructor(
    state: Partial<FullDiffPanelState> | undefined,
    onStateChange: (state: FullDiffPanelState) => void = () => {}
  ) {
    this.panel = document.getElementById("fullDiffPanel")!;
    this.filenameElem = document.getElementById("fullDiffFilename")!;
    this.contentElem = document.getElementById("fullDiffContent")!;
    this.onStateChange = onStateChange;
    this.height = clampHeight(state?.height ?? DEFAULT_FULL_DIFF_HEIGHT);

    document.getElementById("fullDiffCloseBtn")!.addEventListener("click", () => this.close());
    this.setupResize(document.getElementById("fullDiffResizeHandle")!);
    this.applyLayout();
  }

  public getState(): FullDiffPanelState {
    return { height: this.height };
  }

  /** Opens the panel for a file and shows the loading state until data arrives. */
  public open(filePath: string) {
    this.hidden = false;
    this.filenameElem.textContent = filePath;
    this.contentElem.innerHTML = `<div class="fullDiffMessage">${escapeHtml(l10n.loading)}</div>`;
    this.applyLayout();
    this.onStateChange(this.getState());
  }

  public close() {
    if (this.hidden) {
      return;
    }
    this.hidden = true;
    this.contentElem.innerHTML = "";
    this.applyLayout();
    this.onStateChange(this.getState());
  }

  public isHidden(): boolean {
    return this.hidden;
  }

  /** Replaces the body with the rendered file, or with a failure message. */
  public render(data: FullDiffData | null) {
    if (this.hidden) {
      return;
    }
    this.contentElem.innerHTML = renderFullDiff(data);
    this.contentElem.scrollTop = 0;
  }

  private applyLayout() {
    document.body.classList.toggle("fullDiffPanelHidden", this.hidden);
    document.body.style.setProperty("--full-diff-height", `${this.hidden ? 0 : this.height}px`);
    this.panel.style.height = `${this.height}px`;
  }

  /** Drags the top edge; the new height is persisted only when the drag ends. */
  private setupResize(handle: HTMLElement) {
    const onMove = (event: MouseEvent) => {
      // The panel is docked to the bottom, so dragging up makes it taller.
      this.height = clampHeight(window.innerHeight - event.clientY);
      this.applyLayout();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this.onStateChange(this.getState());
    };
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}

function clampHeight(height: number): number {
  return Math.max(
    MIN_HEIGHT,
    Math.min(Math.max(MIN_HEIGHT, window.innerHeight - MAX_VIEWPORT_REMAINDER), height)
  );
}
