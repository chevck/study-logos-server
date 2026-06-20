import { Router } from "express";
import {
  createPasswordResetToken,
  hashPassword,
  hashResetToken,
  isValidEmail,
  validateFullName,
  validatePassword,
  verifyPassword,
} from "../lib/auth.js";
import {
  attachRefreshedToken,
  signAccessToken,
} from "../lib/session.js";
import {
  loadSessionUser,
  requireSession,
} from "../middleware/auth.js";
import {
  ensureUserIndexes,
  getUsersCollection,
  normalizeEmail,
  publicUser,
} from "../lib/users.js";
import { normalizeTheme } from "../lib/theme.js";

const router = Router();

let indexesReady = false;

async function usersReady() {
  if (!indexesReady) {
    await ensureUserIndexes();
    indexesReady = true;
  }
  return getUsersCollection();
}

function clientAppOrigin() {
  return (
    process.env.CLIENT_APP_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:5173"
  );
}

function sendResetEmail(email, resetUrl) {
  const smtpHost = process.env.SMTP_HOST?.trim();
  if (!smtpHost) {
    console.log(
      `[study-logos] Password reset for ${email} (SMTP not configured):\n  ${resetUrl}`,
    );
    return;
  }
  // Email delivery can be wired to SMTP later; reset link is logged when unset.
  console.log(`[study-logos] Password reset link for ${email}:\n  ${resetUrl}`);
}

router.post("/signup", async (req, res, next) => {
  try {
    await usersReady();
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    const nameError = validateFullName(fullName);
    if (nameError) {
      return res.status(400).json({ error: nameError });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const users = await getUsersCollection();
    const existing = await users.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();
    const result = await users.insertOne({
      fullName,
      email,
      passwordHash,
      theme: "system",
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      user: publicUser({ _id: result.insertedId, fullName, email }),
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    await usersReady();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Password is required." });
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signAccessToken(user._id);
    attachRefreshedToken(res, user._id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    await usersReady();
    const email = normalizeEmail(req.body?.email);
    const genericMessage =
      "If an account exists for that email, we sent password reset instructions.";

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ email });

    if (user) {
      const { token, tokenHash, expiresAt } = createPasswordResetToken();
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            resetTokenHash: tokenHash,
            resetTokenExpires: expiresAt,
            updatedAt: new Date(),
          },
        },
      );

      const resetUrl = `${clientAppOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
      sendResetEmail(email, resetUrl);

      if (process.env.NODE_ENV !== "production") {
        return res.json({ message: genericMessage, resetUrl });
      }
    }

    res.json({ message: genericMessage });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    await usersReady();
    const token = String(req.body?.token ?? "").trim();
    const password = req.body?.password;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required." });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const tokenHash = hashResetToken(token);
    const users = await getUsersCollection();
    const user = await users.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "This reset link is invalid or has expired." });
    }

    const passwordHash = await hashPassword(password);
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
        $unset: {
          resetTokenHash: "",
          resetTokenExpires: "",
        },
      },
    );

    res.json({ message: "Your password has been reset. You can sign in now." });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireSession, loadSessionUser, (req, res) => {
  res.json({ user: req.user });
});

router.patch("/me", requireSession, async (req, res, next) => {
  try {
    const theme = normalizeTheme(req.body?.theme);
    if (!theme) {
      return res.status(400).json({ error: "Theme must be light, dark, or system." });
    }

    await usersReady();
    const { ObjectId } = await import("mongodb");
    const users = await getUsersCollection();
    const userId = ObjectId.isValid(req.user.id)
      ? new ObjectId(String(req.user.id))
      : req.user.id;

    await users.updateOne(
      { _id: userId },
      { $set: { theme, updatedAt: new Date() } },
    );

    const updated = await users.findOne({ _id: userId });
    if (!updated) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
