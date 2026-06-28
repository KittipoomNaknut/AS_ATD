function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY');
  },
  get qrJwtSecret() {
    return required('QR_JWT_SECRET');
  },
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? 'email.kmutnb.ac.th',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
};
