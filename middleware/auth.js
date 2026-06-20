import { ObjectId } from "mongodb";
import {
  attachRefreshedToken,
  bearerTokenFromRequest,
  verifyAccessToken,
} from "../lib/session.js";
import { getUsersCollection, publicUser } from "../lib/users.js";

const SESSION_EXPIRED = "Session expired. Please sign in again.";

function sessionError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Validates Bearer token when present. Refreshes the 24h sliding window on success.
 * No token → continues without req.user.
 * Invalid/expired token → 401.
 */
export function authenticateSession(req, res, next) {
  const token = bearerTokenFromRequest(req);
  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    attachRefreshedToken(res, payload.sub);
    return next();
  } catch {
    return next(sessionError(401, SESSION_EXPIRED));
  }
}

/** Requires a valid Bearer token (same sliding refresh as authenticateSession). */
export function requireSession(req, res, next) {
  const token = bearerTokenFromRequest(req);
  if (!token) {
    return next(sessionError(401, "Sign in to continue."));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    attachRefreshedToken(res, payload.sub);
    return next();
  } catch {
    return next(sessionError(401, SESSION_EXPIRED));
  }
}

export async function loadSessionUser(req, _res, next) {
  if (!req.user?.id) {
    return next();
  }

  try {
    const users = await getUsersCollection();
    const userId = ObjectId.isValid(req.user.id)
      ? new ObjectId(String(req.user.id))
      : req.user.id;
    const user = await users.findOne({ _id: userId });
    if (!user) {
      return next(sessionError(401, SESSION_EXPIRED));
    }
    req.user = publicUser(user);
    return next();
  } catch (err) {
    return next(err);
  }
}
