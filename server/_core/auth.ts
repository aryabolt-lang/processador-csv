import { Express, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import * as db from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "seu-segredo-super-secreto-mude-em-producao";
const JWT_EXPIRY = "7d";

export interface AuthPayload {
  userId: number;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

// Middleware para verificar JWT
export function authMiddleware(req: AuthRequest, res: Response, next: Function) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

// Gerar JWT
export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Hash de senha
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verificar senha
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Registrar rotas de autenticação
export function registerAuthRoutes(app: Express) {
  // POST /api/auth/register - Registrar novo usuário
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      // Verificar se usuário já existe
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email já cadastrado" });
      }

      // Hash da senha
      const passwordHash = await hashPassword(password);

      // Criar usuário
      const user = await db.createUser({
        email,
        passwordHash,
        name: name || email,
        role: "user",
      });

      const token = generateToken(user.id, user.email);

      return res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
        token,
      });
    } catch (error: any) {
      console.error("[auth/register]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // POST /api/auth/login - Fazer login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      // Buscar usuário
      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      // Verificar senha
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      // Atualizar último login
      await db.updateUserLastLogin(user.id);

      const token = generateToken(user.id, user.email);

      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        token,
      });
    } catch (error: any) {
      console.error("[auth/login]", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // GET /api/auth/me - Obter dados do usuário autenticado
  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const user = await db.getUserById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("[auth/me]", error);
      return res.status(500).json({ error: error.message });
    }
  });
}
