export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">เข้าระบบอาจารย์</h1>
      <p className="text-sm text-zinc-600">
        ใช้บัญชี Google ของมหาวิทยาลัย (@email.kmutnb.ac.th)
      </p>
      <LoginError searchParams={searchParams} />
      <button
        className="rounded-md bg-zinc-900 px-6 py-2 text-white dark:bg-white dark:text-zinc-900"
        disabled
      >
        Sign in with Google (TODO)
      </button>
    </main>
  );
}

async function LoginError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
      {error === 'invalid_domain'
        ? 'ใช้เฉพาะอีเมลของ KMUTNB เท่านั้น'
        : 'เข้าระบบไม่สำเร็จ'}
    </p>
  );
}
