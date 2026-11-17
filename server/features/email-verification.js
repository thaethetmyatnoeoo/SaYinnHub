import {
  randomInt,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const emailAddress = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());

export async function sendVerificationEmail(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    fail(
      "Email verification is not configured yet. Please contact the site owner.",
      503,
    );
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: "Your Sayinn Hub verification code",
        text: `Your Sayinn Hub verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail("Unable to send the verification email. Please try again later.", 503);
  }
  if (!response.ok)
    fail("Unable to send the verification email. Please try again later.", 503);
}

export async function emailVerification(db, send = sendVerificationEmail) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS email_challenges (email TEXT PRIMARY KEY, id TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, expires TEXT NOT NULL, sent TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0)",
  );
  return {
    async request(rawEmail) {
      const email = emailAddress.parse(rawEmail),
        id = randomUUID();
      const code = String(randomInt(1000000)).padStart(6, "0");
      const salt = randomBytes(32).toString("hex");
      const time = Date.now();
      await db.transaction(async (tx) => {
        // Serialize per-address requests on both SQLite and PostgreSQL.
        await tx.query(
          "INSERT INTO email_challenges (email,id,salt,digest,expires,sent) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING",
          [email, "", "", "", "", ""],
        );
        await tx.query(
          "UPDATE email_challenges SET email=email WHERE email=?",
          [email],
        );
        const [previous] = await tx.query(
          "SELECT sent FROM email_challenges WHERE email=?",
          [email],
        );
        if (previous.sent && time - Date.parse(previous.sent) < 60000)
          fail("Wait 60 seconds before requesting another code.", 429);
        await tx.query(
          "UPDATE email_challenges SET id=?,salt=?,digest=?,expires=?,sent=?,attempts=0,ready=0 WHERE email=?",
          [
            id,
            salt,
            scryptSync(code, salt, 32).toString("hex"),
            new Date(time + 600000).toISOString(),
            new Date(time).toISOString(),
            email,
          ],
        );
      });
      await send(email, code);
      await db.query(
        "UPDATE email_challenges SET ready=1 WHERE email=? AND id=?",
        [email, id],
      );
      return { challengeId: id, expiresIn: 600, retryAfter: 60 };
    },
    async consume(rawEmail, id, code) {
      const email = emailAddress.parse(rawEmail);
      if (
        typeof id !== "string" ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
      )
        fail("Enter the six-digit code sent to your email.");
      const valid = await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE email_challenges SET email=email WHERE email=?",
          [email],
        );
        const [row] = await tx.query(
          "SELECT * FROM email_challenges WHERE email=?",
          [email],
        );
        if (
          !row ||
          row.id !== id ||
          !row.ready ||
          row.attempts >= 5 ||
          Date.parse(row.expires) <= Date.now()
        )
          return false;
        await tx.query(
          "UPDATE email_challenges SET attempts=attempts+1 WHERE email=?",
          [email],
        );
        if (
          !timingSafeEqual(
            scryptSync(code, row.salt, 32),
            Buffer.from(row.digest, "hex"),
          )
        )
          return false;
        await tx.query("UPDATE email_challenges SET ready=0 WHERE email=?", [
          email,
        ]);
        return true;
      });
      if (!valid)
        fail(
          "The verification code is invalid or expired. Request a new code if needed.",
        );
    },
  };
}
