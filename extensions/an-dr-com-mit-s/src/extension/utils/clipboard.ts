import { vscodeUiPort } from "@/extension/utils/vscodeUiPort";

export function copyToClipboard(text: string) {
  return vscodeUiPort.copyToClipboard(text);
}
