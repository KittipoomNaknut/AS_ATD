import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">AS_ATD</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        ระบบเช็คชื่อนักศึกษาภาควิชาสถิติประยุกต์
      </p>
      <div className="flex gap-3">
        <Link
          href="/admin"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          เข้าระบบอาจารย์
        </Link>
        <Link
          href="/checkin"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          หน้าเช็คชื่อ
        </Link>
      </div>
    </main>
  );
}
