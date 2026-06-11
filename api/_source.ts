import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import uploadRoutes from "../server/uploadRoutes";
import contatosRoutes from "../server/contatosRoutes";
import whatsappRoutes from "../server/whatsappRoutes";
import emailRoutes from "../server/emailRoutes";
import protocolosRoutes from "../server/protocolosRoutes";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check endpoint (no DB required)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

export default app;
