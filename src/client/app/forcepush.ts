import { button, div, signal } from "solid-vanilla";
import { fetchJson } from "../../common/interface";

const label = (on: boolean) => `force push: ${on ? "ALLOWED" : "denied"}`;

/** Break-glass toggle for force pushes over HTTP; in-memory on the server. */
export const ForcePushToggle = () => {
  const on = signal(false);
  return div()
    .css("display", "flex")
    .css("justify-content", "flex-end")
    .css("margin-bottom", "0.5rem")
    .do(async (node) => on.set(await fetchJson("forcePushEnabled")))
    .watch(on, (node) =>
      node.inner(
        button()
          .css("padding", "0.25rem 0.75rem")
          .css("cursor", "pointer")
          .css("background-color", on.get() ? "#a33" : "#424242")
          .css("color", "#eee")
          .css("border", `1px solid ${on.get() ? "#c55" : "#666"}`)
          .on("click", async () =>
            on.set(await fetchJson("setForcePushEnabled", !on.get())),
          )
          .inner(label(on.get())),
      ),
    );
};
