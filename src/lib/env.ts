// IMPORTANT: NEXT_PUBLIC_* vars must be accessed with literal keys so the
// Next.js compiler can statically inline them into the browser bundle.
// Dynamic `process.env[name]` access only works on the server.

function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: requireValue(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: requireValue(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  // server-only — lazy so it doesn't throw on the client
  get supabaseSecretKey() {
    return requireValue('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY);
  },
  get qrJwtSecret() {
    return requireValue('QR_JWT_SECRET', process.env.QR_JWT_SECRET);
  },
  allowedEmailDomain:
    process.env.ALLOWED_EMAIL_DOMAIN ?? 'email.kmutnb.ac.th',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};
