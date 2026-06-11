import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { InsertUser, users } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: Partial<InsertUser> & { openId?: string }): Promise<void> {
  const db = getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { lastSignedIn: user.lastSignedIn ?? new Date() };
    if (user.openId) values.openId = user.openId;
    const updateSet: Record<string, unknown> = {};
    const fields = ["name", "email", "loginMethod", "passwordHash", "role"] as const;
    for (const field of fields) {
      const value = (user as Record<string, unknown>)[field];
      if (value !== undefined) {
        (values as Record<string, unknown>)[field] = value ?? null;
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
  const db = getDb();
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
