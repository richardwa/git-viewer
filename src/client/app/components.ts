import { h, RNode, Signal } from "solid-vanilla";

export const Title = () => h("div").css("font-weight", "bold");

export const Panel = () =>
  h("div")
    .css("border-radius", "5px")
    .css("padding", "0.5rem")
    .css("background-color", "#424242");

export const Button = () =>
  h("button").attr("type", "button").css("padding", "0.25rem");

export const NavLink = (href: string) =>
  h("a").attr("href", href).attr("target", "_blank");

export const ClickLink = () =>
  h("a").css("cursor", "pointer").css("color", "#4d9fff");

export const HashLink = (href: string) =>
  h("a").attr("href", href).css("cursor", "pointer").css("color", "#4d9fff");

export const TextInput = (val: Signal<string>) =>
  h("input")
    .attr("type", "text")
    .attr("value", val)
    .on("change", (event) => val.set(event.target.value));

export const NumberInput = (val: Signal<number>) =>
  h("input")
    .attr("type", "number")
    .attr("value", () => `${val}`)
    .on("change", (event) => val.set(event.target.value));
