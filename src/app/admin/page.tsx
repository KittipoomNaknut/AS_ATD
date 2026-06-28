import { createClient } from '@/lib/supabase/server';

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <p className="mt-2 text-zinc-600">เข้าระบบ: {user?.email}</p>
      <p className="mt-4 text-sm text-zinc-500">
        TODO: รายการ session, นำเข้านักศึกษา, สร้างคาบใหม่
      </p>
    </main>
  );
}
