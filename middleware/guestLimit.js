import { getGuestUsageCollection } from "../lib/mongo.js";
import {
  GUEST_STUDY_CALL_LIMIT,
  guestIdFromRequest,
} from "../lib/guest.js";

const GUEST_LIMIT_MESSAGE =
  "Guest preview allows one passage with one word breakdown. Sign in to keep studying.";

function limitError(message) {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = "GUEST_LIMIT";
  return err;
}

/**
 * Anonymous users may call AI study APIs (phrases + breakdown) up to the guest limit.
 * Logged-in users are unlimited.
 */
export async function enforceGuestStudyLimit(req, _res, next) {
  if (req.user?.id) {
    return next();
  }

  const section = req.body?.section;
  if (section && section !== "core") {
    return next();
  }

  const guestId = guestIdFromRequest(req);
  if (!guestId) {
    return next(limitError(GUEST_LIMIT_MESSAGE));
  }

  try {
    const col = await getGuestUsageCollection();
    const existing = await col.findOne({ _id: guestId });

    if (existing && existing.studyCalls >= GUEST_STUDY_CALL_LIMIT) {
      return next(limitError(GUEST_LIMIT_MESSAGE));
    }

    await col.updateOne(
      { _id: guestId },
      {
        $inc: { studyCalls: 1 },
        $set: { updatedAt: new Date() },
      },
      { upsert: true },
    );

    return next();
  } catch (err) {
    return next(err);
  }
}
