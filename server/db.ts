import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { InsertUser, users } from "../drizzle/schema";

// Required for Neon serverless in Node.js environment
neonConfig.webSocketConstructor = ws;

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: Partial<InsertUser> & { openId?: string }): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { lastSignedIn: user.lastSignedIn ?? new Date() };
    if (user.openId) values.openId = user.openId;
    const updateSet: Record<string, unknown> = {};
    const fields = ["name", "email", "loginMethod", "passwordHash", "role"] as const;
    for (const field of fields) {
      const value = (user as any)[field];
      if (value !== undefined) {
        (values as any)[field] = value ?? null;
        updateSet[field] = value ?? null;
      }
    }
    if (user.lastSignedIn !== undefined) {
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    // Use email as conflict target (the existing DB schema has email as unique)
    if (values.email) {
      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({
          target: users.email,
          set: updateSet as Partial<InsertUser>,
        });
    } else if (values.openId) {
      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({
          target: users.openId,
          set: updateSet as Partial<InsertUser>,
        });
    } else {
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
