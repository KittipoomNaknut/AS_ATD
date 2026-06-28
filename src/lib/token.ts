import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

const TOKEN_TTL_SECONDS = 20;

interface TokenPayload {
  sid: string;
  nonce: string;
}

function secretBytes() {
  return new TextEncoder().encode(env.qrJwtSecret);
}

function randomNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signSessionToken(sessionId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

  const token = await new SignJWT({ sid: sessionId, nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretBytes());

  return { token, expiresAt };
}

export async function verifySessionToken(
  token: string,
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secretBytes());
  return { sid: payload.sid as string, nonce: payload.nonce as string };
}

export const tokenConfig = { ttlSeconds: TOKEN_TTL_SECONDS };
