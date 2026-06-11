import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./server/routers";
import { createContext } from "./server/_core/context";
import uploadRoutes from "./server/uploadRoutes";
import contatosRoutes from "./server/contatosRoutes";
import whatsappRoutes from "./server/whatsappRoutes";
import emailRoutes from "./server/emailRoutes";
import protocolosRoutes from "./server/protocolosRoutes";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/upload", uploadRoutes);
app.use("/api/contatos", contatosRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/protocolos", protocolosRoutes);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Export as default for Vercel Express detection
export default app;

// Call listen() so Vercel can detect this as a Node.js server
// Vercel intercepts this and routes requests through its own mechanism
const port = parseInt(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/`);
});
