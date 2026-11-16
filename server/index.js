import { database } from "./database.js";
import { createHub } from "./hub.js";
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
  throw new Error("Production requires DATABASE_URL.");
if (process.env.NODE_ENV === "production" && process.env.DEMO === "true")
  throw new Error("Demo mode cannot run in production.");
const db = await database();
const app = await createHub(db, { demo: process.env.DEMO === "true" });
const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
  console.log(
    `SaYinn API ready at http://127.0.0.1:${process.env.PORT || 3001}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await app.closeShops();
      await db.close();
      process.exit(0);
    }),
  );
