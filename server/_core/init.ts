import * as db from "../db";
import { hashPassword } from "./auth";

/**
 * Inicializa o banco de dados com um usuário admin padrão
 * Executado apenas uma vez na primeira inicialização
 */
export async function initializeAdmin() {
  try {
    // Verificar se admin já existe
    const adminExists = await db.getUserByEmail("admin@example.com");
    if (adminExists) {
      console.log("[Init] Admin user already exists");
      return;
    }

    // Criar usuário admin
    const passwordHash = await hashPassword("admin123");
    const admin = await db.createUser({
      email: "admin@example.com",
      name: "Administrador",
      passwordHash,
      role: "admin",
    });

    console.log("[Init] Admin user created successfully");
    console.log("[Init] Email: admin@example.com");
    console.log("[Init] Password: admin123");
    console.log("[Init] ⚠️  IMPORTANTE: Mude a senha do admin em produção!");
  } catch (error: any) {
    // Se o erro for porque o usuário já existe, ignora
    if (error.message?.includes("unique constraint") || error.message?.includes("duplicate")) {
      console.log("[Init] Admin user already exists (constraint error)");
      return;
    }
    console.error("[Init] Failed to initialize admin user:", error);
  }
}
