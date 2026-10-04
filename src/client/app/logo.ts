import { h, vbox, div } from "solid-vanilla";
import { HashLink } from "./components";

// App logo: /logo.svg (served from public/) next to the app name.
export const Logo = () =>
  HashLink("#/")
    .css("display", "flex")
    .css("align-items", "center")
    .css("gap", "0.5rem")
    .css("text-decoration", "none")
    .css("color", "inherit")
    .inner(
      h("img")
        .attr("src", "/logo.svg")
        .attr("alt", "git viewer logo")
        .attr("width", "26")
        .attr("height", "26"),
      vbox()
        .css("gap", "0")
        .inner(
          div()
            .css("font-weight", "bold")
            .css("font-size", "1.05rem")
            .css("line-height", "1.1")
            .inner("git viewer"),
          div()
            .css("font-size", "0.7rem")
            .css("color", "#999")
            .inner("self-hosted repos"),
        ),
    );
