import { LoginButton } from './login-button';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">AS_ATD</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          เข้าระบบสำหรับอาจารย์ — ใช้บัญชี Google ของมหาวิทยาลัย
          (<span className="font-mono">@email.kmutnb.ac.th</span>)
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMessage(error)}
        </p>
      )}

      <LoginButton />
    </main>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'invalid_domain':
      return 'ใช้ได้เฉพาะอีเมล @email.kmutnb.ac.th — โปรดออกจากระบบ Google แล้วลองใหม่';
    case 'oauth_failed':
      return 'เข้าระบบ Google ไม่สำเร็จ';
    default:
      return 'เกิดข้อผิดพลาด';
  }
}
