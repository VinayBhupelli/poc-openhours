/** IANA timezone for the browser (used for labels; API times are UTC ISO strings). */
export function getClientTimeZone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
