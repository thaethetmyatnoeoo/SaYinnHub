import { z } from "zod";
export const passwordPolicy = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128)
  .regex(/[a-zA-Z]/, "Include a letter.")
  .regex(/[0-9]/, "Include a number.")
  .refine((v) => !/^(.)(\1)+$/.test(v), "Choose a stronger password.");
export const phoneNumber = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+0-9 ()-]+$/, "Enter a valid phone number.")
  .transform((v) => v.replace(/[ ()-]/g, ""))
  .transform((v) => (v.startsWith("09") ? "+95" + v.slice(1) : v))
  .refine(
    (v) =>
      /^\+959\d{7,9}$/.test(v) ||
      (/^\+[1-9]\d{7,14}$/.test(v) && !v.startsWith("+95")),
    "Use a Myanmar mobile number (09…) or an international number with country code.",
  );
export const optionalPhone = z.union([z.literal(""), phoneNumber]).default("");
