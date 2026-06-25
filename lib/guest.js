const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GUEST_STUDY_CALL_LIMIT = 2;

export function guestIdFromRequest(req) {
  const raw = req.headers["x-guest-id"];
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return UUID_RE.test(id) ? id : null;
}

export function isValidGuestId(id) {
  return typeof id === "string" && UUID_RE.test(id);
}
