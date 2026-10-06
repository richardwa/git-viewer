import { h, vbox, div } from "solid-vanilla";
import { HashLink } from "solid-vanilla-ui";

// App logo: /logo.svg (served from public/) next to the app name.
export const Logo = () =>
  HashLink("#/")
    .css("display", "flex")
    .css("align-items", "flex-start")
    .css("gap", "0.5rem")
    .css("text-decoration", "none")
    .css("color", "inherit")
    .inner(
      h("img")
        .attr("src", "/logo.svg")
        .attr("alt", "git viewer logo")
        .attr("width", "40")
        .attr("height", "40"),
      vbox()
        .css("gap", "0")
        .inner(
          div()
            .css("font-weight", "bold")
            .css("font-size", "1.6rem")
            .css("line-height", "1.1")
            .inner("git viewer"),
          div()
            .css("font-size", "0.95rem")
            .css("color", "#999")
            .inner("self-hosted repos"),
        ),
    );
