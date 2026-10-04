import { h, Signal } from "solid-vanilla";

export const Title = () => h("strong");

// Pico <article> = card/panel styling
export const Panel = () => h("article").css("margin", "0");

// Pico styles <button> natively; "outline"/"contrast" classes via .cn()
export const Button = () => h("button").attr("type", "button");

export const NavLink = (href: string) =>
  h("a").attr("href", href).attr("target", "_blank");

// Pico styles <a> with the primary color; cursor for JS-driven links only
export const ClickLink = () => h("a").css("cursor", "pointer");

export const HashLink = (href: string) =>
  h("a").attr("href", href).css("cursor", "pointer");

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
