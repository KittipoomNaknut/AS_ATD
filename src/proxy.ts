import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { env } from '@/lib/env';

// Protect /admin/* — require Supabase session + email domain on allow-list
export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) =>
        toSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        ),
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;

  if (path.startsWith('/admin') && path !== '/admin/login') {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
    const email = user.email ?? '';
    if (!email.endsWith(`@${env.allowedEmailDomain}`)) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('error', 'invalid_domain');
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ['/admin/:path*'],
};
