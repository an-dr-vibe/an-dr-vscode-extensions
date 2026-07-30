import { renderBranchPanel } from "./branchPanelRender";
import { svgIcons } from "./utils/icons";

export const DEFAULT_BRANCH_PANEL_WIDTH = 220;

export interface BranchPanelState {
  hidden: boolean;
  width: number;
}

export interface BranchPanelRenderOption {
  name: string;
  value: string;
  selected: boolean;
  current: boolean;
}

export interface BranchPanelRenderModel {
  options: readonly BranchPanelRenderOption[];
}

/** Owns the branch sidebar layout; behavior is added separately. */
export class BranchPanel {
  private readonly list: HTMLElement;
  private readonly sidebar: HTMLElement;
  private readonly toggle: HTMLElement;
  private readonly onLayoutChange: (state: BranchPanelState) => void;
  private width: number;
  private hidden: boolean;
  private options: BranchPanelRenderOption[] = [];

  constructor(
    state: Partial<BranchPanelState> | undefined,
    onLayoutChange: (state: BranchPanelState) => void
  ) {
    this.sidebar = document.getElementById("branchPanelSidebar")!;
    this.list = document.getElementById("branchPanel")!;
    this.toggle = document.getElementById("branchPanelToggle")!;
    this.onLayoutChange = onLayoutChange;
    this.width = state?.width ?? DEFAULT_BRANCH_PANEL_WIDTH;
    this.hidden = state?.hidden ?? false;

    this.toggle.innerHTML = svgIcons.branch;
    this.toggle.addEventListener("click", () => this.setHidden(!this.hidden));
    this.setupResize(document.getElementById("branchPanelResizeHandle")!);
    this.applyLayout(false);
  }

  public setOptions(options: readonly { name: string; value: string }[], selected: string) {
    this.options = options.map((option) => ({
      ...option,
      selected: option.value === selected,
      current: false
    }));
    this.render();
  }

  public setCurrentBranch(branch: string | null) {
    for (const option of this.options) {
      option.current = option.value === branch;
    }
    this.render();
  }

  public getState(): BranchPanelState {
    return { hidden: this.hidden, width: this.width };
  }

  private setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.applyLayout();
  }

  private applyLayout(notify = true) {
    document.body.classList.toggle("branchPanelHidden", this.hidden);
    document.body.style.setProperty("--branch-panel-width", `${this.hidden ? 0 : this.width}px`);
    this.sidebar.style.width = `${this.width}px`;
    this.toggle.classList.toggle("active", !this.hidden);
    if (notify) {
      this.onLayoutChange(this.getState());
    }
  }

  private setupResize(handle: HTMLElement) {
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = this.width;
      const move = (moveEvent: MouseEvent) => {
        this.width = Math.max(140, Math.min(600, startWidth + moveEvent.clientX - startX));
        this.applyLayout(false);
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        this.onLayoutChange(this.getState());
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  private render() {
    this.list.innerHTML = renderBranchPanel({ options: this.options });
  }
}
