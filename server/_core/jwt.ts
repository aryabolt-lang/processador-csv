import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";

export type SessionPayload = { userId: number; openId: string };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "mude-em-producao";
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, expiresInMs = ONE_YEAR_MS): Promise<string> {
  return new SignJWT({ userId: payload.userId, openId: payload.openId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(getSecretKey());
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    const { userId, openId } = payload as Record<string, unknown>;
    if (typeof userId !== "number" || typeof openId !== "string") return null;
    return { userId, openId };
  } catch { return null; }
}

export async function authenticateRequest(req: Request) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[COOKIE_NAME];
  const session = await verifySession(token);
  if (!session) return null;
  const user = await db.getUserByOpenId(session.openId);
  return user ?? null;
}
