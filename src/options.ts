import { getSettings, setSettings } from "./settings.ts";

const autoCloseAfterDays = document.getElementById(
  "autoCloseAfterDays"
) as HTMLInputElement;

const days = (await getSettings()).autoCloseAfterDays;
autoCloseAfterDays.value = days > 0 ? String(days) : "";
autoCloseAfterDays.addEventListener("input", () => {
  const value = autoCloseAfterDays.valueAsNumber;
  // Empty, 0, negative, or not a number all mean off.
  setSettings({ autoCloseAfterDays: value > 0 ? value : 0 });
});
