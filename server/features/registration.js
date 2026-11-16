import { passwordPolicy, phoneNumber, optionalPhone } from "./validation.js";
import { z } from "zod";

export const personalDetails = z.object({
  name: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Use letters, numbers, dots, dashes or underscores.",
    ),
  email: z.string().trim().email().max(254),
  phone: phoneNumber,
  password: passwordPolicy,
});
export const shopCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single dashes.",
  );
export const registration = personalDetails
  .extend({
    confirmPassword: z.string().optional(),
    role: z.enum(["OWNER", "MEMBER"]),
    shopCode: shopCodeSchema.optional(),
    storeName: z.string().trim().max(150).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.confirmPassword !== undefined && d.password !== d.confirmPassword)
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords must match.",
      });
    if (d.role === "MEMBER" && !d.shopCode)
      ctx.addIssue({
        code: "custom",
        path: ["shopCode"],
        message: "Shop code is required.",
      });
    if (d.role === "OWNER" && !d.storeName)
      ctx.addIssue({
        code: "custom",
        path: ["storeName"],
        message: "Shop name is required.",
      });
  });
