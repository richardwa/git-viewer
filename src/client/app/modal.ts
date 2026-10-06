import { div, h } from "solid-vanilla";
import { Button, Panel } from "solid-vanilla-ui";

export const asDialog = (dlg: ReturnType<typeof h>) =>
  dlg.el as HTMLDialogElement;

/** Circular ✕ close icon, straddling the top-right corner of its parent
 *  (wrap the parent in `PanelBox` so it anchors to the panel, not the
 *  dialog). */
export const CloseIcon = (close: () => void) =>
  Button()
    .cn("outline")
    .css("position", "absolute")
    .css("top", "-1rem")
    .css("right", "-1rem")
    .css("width", "2rem")
    .css("height", "2rem")
    .css("padding", "0")
    .css("border-radius", "50%")
    .css("line-height", "1")
    .css("font-size", "1.1rem")
    .css("margin", "0")
    .attr("title", "close")
    .css("cursor", "pointer")
    .on("click", close)
    .inner("✕");

/** Relative container that anchors a CloseIcon to the panel's corner.
 *  Extra children are appended INSIDE the panel (avoid `.inner()` on the
 *  returned wrapper — it would replace the panel and icon). */
export const PanelBox = (
  close: () => void,
  panel: ReturnType<typeof Panel>,
  ...content: Parameters<ReturnType<typeof Panel>["inner"]>
) =>
  div()
    .css("position", "relative")
    .inner(content.length ? panel.inner(...content) : panel, CloseIcon(close));
