import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
export function configureHttp(app) {
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
        },
      },
    }),
  );
  app.use("/api/v1/images", express.json({ limit: "3mb" }));
  app.use(express.json({ limit: "100kb" }), cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    const devOrigins =
      process.env.NODE_ENV === "production"
        ? []
        : ["http://127.0.0.1:5173", "http://localhost:5173"];
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      origin &&
      new URL(origin).host !== req.get("host") &&
      origin !== process.env.APP_ORIGIN &&
      !devOrigins.includes(origin)
    )
      return res
        .status(403)
        .json({ error: { message: "Cross-origin request blocked" } });
    next();
  });
}
