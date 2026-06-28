import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

// Supabase OAuth callback — exchange code for session, then redirect.
// Domain allow-list enforcement happens in proxy.ts on the next request.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=oauth_failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/admin/login?error=oauth_failed`);
  }

  const email = data.session.user.email ?? '';
  if (!email.endsWith(`@${env.allowedEmailDomain}`)) {
    // Bad domain — sign out so the session doesn't linger, then bounce back.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/admin/login?error=invalid_domain`);
  }

  return NextResponse.redirect(`${origin}/admin`);
}
