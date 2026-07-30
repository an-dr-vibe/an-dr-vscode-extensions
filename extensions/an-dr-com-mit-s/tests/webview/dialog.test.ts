import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hideDialog,
  isDialogOpen,
  showCheckboxDialog,
  showConfirmationDialog,
  showErrorDialog,
  showRefInputDialog,
  showSelectDialog
} from "@/webview/dialog";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

function dialogElem(): HTMLElement {
  return document.getElementById("dialog")!;
}

function backingElem(): HTMLElement {
  return document.getElementById("dialogBacking")!;
}

function click(id: string) {
  document.getElementById(id)!.dispatchEvent(new MouseEvent("click"));
}

describe("dialog", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
    hideDialog();
  });

  it("opens over a backing layer and closes again", () => {
    showConfirmationDialog("Delete the branch?", () => {}, null);

    expect(isDialogOpen()).toBe(true);
    expect(backingElem().className).toBe("active");

    click("dialogDismiss");

    expect(isDialogOpen()).toBe(false);
    expect(backingElem().className).toBe("");
    expect(dialogElem().innerHTML).toBe("");
  });

  it("runs the confirmed action only when confirmed", () => {
    const confirmed = vi.fn();
    showConfirmationDialog("Delete the branch?", confirmed, null);

    click("dialogDismiss");
    expect(confirmed).not.toHaveBeenCalled();

    showConfirmationDialog("Delete the branch?", confirmed, null);
    click("dialogAction");
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it("marks and unmarks the element the dialog was opened from", () => {
    // The source keeps a highlight so the user can see which row a dialog
    // belongs to, and it has to be cleared however the dialog is closed.
    const source = document.getElementById("refreshBtn")!;
    showConfirmationDialog("Confirm?", () => {}, source);
    expect(source.classList.contains("dialogActive")).toBe(true);

    hideDialog();
    expect(source.classList.contains("dialogActive")).toBe(false);
  });

  it("reports the checkbox state as a boolean", () => {
    const actioned = vi.fn();
    showCheckboxDialog("Push the tag?", "Also push", false, "Yes", actioned, null);

    (document.getElementById("dialogInput0") as HTMLInputElement).checked = true;
    click("dialogAction");

    expect(actioned).toHaveBeenCalledWith(true);
  });

  it("reports the selected option value", () => {
    const actioned = vi.fn();
    showSelectDialog(
      "Pick a remote",
      "origin",
      [
        { name: "origin", value: "origin" },
        { name: "upstream", value: "upstream" }
      ],
      "Push",
      actioned,
      null
    );

    const select = document.getElementById("dialogInput0") as HTMLSelectElement;
    expect(select.value).toBe("origin");
    select.value = "upstream";
    click("dialogAction");

    expect(actioned).toHaveBeenCalledWith("upstream");
  });

  it("escapes an option name rather than injecting markup", () => {
    showSelectDialog(
      "Pick",
      "a",
      [{ name: "<img src=x onerror=alert(1)>", value: "a" }],
      "Go",
      () => {},
      null
    );

    expect(dialogElem().querySelector("img")).toBeNull();
  });

  describe("ref input", () => {
    it("blocks the action while the field is empty", () => {
      const actioned = vi.fn();
      showRefInputDialog("Name the branch", "", "Create", actioned, null);

      expect(dialogElem().className).toBe("active noInput");
      click("dialogAction");
      expect(actioned).not.toHaveBeenCalled();
    });

    it("blocks the action for a name Git would reject", () => {
      const actioned = vi.fn();
      showRefInputDialog("Name the branch", "ok", "Create", actioned, null);

      const input = document.getElementById("dialogInput0") as HTMLInputElement;
      input.value = "bad..name";
      input.dispatchEvent(new KeyboardEvent("keyup"));

      expect(dialogElem().className).toBe("active inputInvalid");
      click("dialogAction");
      expect(actioned).not.toHaveBeenCalled();
    });

    it("accepts a valid name and reports it", () => {
      const actioned = vi.fn();
      showRefInputDialog("Name the branch", "", "Create", actioned, null);

      const input = document.getElementById("dialogInput0") as HTMLInputElement;
      input.value = "feature/panels";
      input.dispatchEvent(new KeyboardEvent("keyup"));

      expect(dialogElem().className).toBe("active");
      click("dialogAction");
      expect(actioned).toHaveBeenCalledWith("feature/panels");
    });
  });

  it("shows an error reason as escaped text on its own line", () => {
    showErrorDialog("Could not push", "fatal: <remote> rejected\nsecond line", null);

    const reason = dialogElem().querySelector(".errorReason")!;
    expect(reason.textContent).toContain("fatal: <remote> rejected");
    expect(reason.innerHTML).toContain("<br>");
    expect(reason.querySelector("remote")).toBeNull();
  });
});
