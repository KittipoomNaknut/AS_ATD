import { createClient } from '@/lib/supabase/server';

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AS_ATD · Admin</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            เข้าระบบ: {user?.email}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            ออกจากระบบ
          </button>
        </form>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="นักศึกษา" desc="นำเข้า/แก้ไขรายชื่อจาก Excel" href="/admin/students" />
        <Card title="คาบเรียน" desc="เริ่มคาบใหม่ · ดูประวัติ" href="/admin/sessions" />
      </section>

      <p className="text-xs text-zinc-500">Phase 1 — TODO: เชื่อมต่อหน้าทั้งสองด้านบน</p>
    </main>
  );
}

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-zinc-200 p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{desc}</p>
    </a>
  );
}
