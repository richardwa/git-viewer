import { authHeader } from "solid-vanilla-ui";
import { apiPath, type ServerApi } from "../common/interface";

// Client-side API fetch: sends the stored Basic credentials as an
// Authorization header (see solid-vanilla-ui auth helpers). Lives in the
// client, not common/, so the server never imports solid-vanilla-ui.
export const fetchJson = <T extends keyof ServerApi>(
  key: T,
  ...params: Parameters<ServerApi[T]>
) =>
  fetch(`${apiPath}/${key}`, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(params),
  }).then((res) => res.json()) as ReturnType<ServerApi[T]>;
