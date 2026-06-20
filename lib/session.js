import jwt from "jsonwebtoken";

/** Session length — refreshed on each authenticated request (sliding window). */
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, jwtSecret(), {
    expiresIn: SESSION_MAX_AGE_SECONDS,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret());
}

export function bearerTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export function attachRefreshedToken(res, userId) {
  res.setHeader("X-Auth-Token", signAccessToken(userId));
}
