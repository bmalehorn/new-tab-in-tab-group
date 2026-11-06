import { getSettings, setSettings } from "./settings.ts";

const autoCloseStaleTabs = document.getElementById(
  "autoCloseStaleTabs"
) as HTMLInputElement;

autoCloseStaleTabs.checked = (await getSettings()).autoCloseStaleTabs;
autoCloseStaleTabs.addEventListener("change", () =>
  setSettings({ autoCloseStaleTabs: autoCloseStaleTabs.checked })
);
