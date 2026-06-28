-- AS_ATD initial schema
-- ระบบเช็คชื่อนักศึกษาภาควิชาสถิติประยุกต์

-- ============================================================
-- students
-- ============================================================
create table public.students (
  student_id   text         primary key,
  first_name   text         not null,
  last_name    text         not null,
  nickname     text,
  major        text         not null,
  section      text         not null,
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index idx_students_section on public.students(section);
create index idx_students_active  on public.students(is_active);

-- ============================================================
-- sessions
-- ============================================================
create table public.sessions (
  id                  uuid          primary key default gen_random_uuid(),
  name                text          not null,
  started_at          timestamptz   not null default now(),
  ended_at            timestamptz,
  lat                 double precision not null,
  lng                 double precision not null,
  radius_meters       integer       not null default 50,
  late_after_minutes  integer       not null default 15,
  created_by          uuid          not null references auth.users(id),
  created_at          timestamptz   not null default now()
);

create index idx_sessions_started on public.sessions(started_at desc);

-- only one open session at a time (ended_at IS NULL)
create unique index idx_sessions_one_open
  on public.sessions ((1)) where ended_at is null;

-- ============================================================
-- check_ins
-- ============================================================
create table public.check_ins (
  session_id    uuid          not null references public.sessions(id) on delete cascade,
  student_id    text          not null references public.students(student_id),
  checked_at    timestamptz   not null default now(),
  status        text          not null check (status in ('present', 'late')),
  lat           double precision,
  lng           double precision,
  distance_m    integer,
  device_hash   text,
  primary key (session_id, student_id)
);

create index idx_checkins_student on public.check_ins(student_id);

-- ============================================================
-- check_in_attempts (รvย rejected attempts สำหรับ flag โกง)
-- ============================================================
create table public.check_in_attempts (
  id            uuid          primary key default gen_random_uuid(),
  session_id    uuid          not null references public.sessions(id) on delete cascade,
  student_id    text,
  attempted_at  timestamptz   not null default now(),
  reason        text          not null,
  lat           double precision,
  lng           double precision,
  distance_m    integer,
  device_hash   text,
  user_agent    text
);

create index idx_attempts_session on public.check_in_attempts(session_id);

-- ============================================================
-- token_nonces (กัน replay attack)
-- ============================================================
create table public.token_nonces (
  nonce      text         primary key,
  used_at    timestamptz  not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.students          enable row level security;
alter table public.sessions          enable row level security;
alter table public.check_ins         enable row level security;
alter table public.check_in_attempts enable row level security;
alter table public.token_nonces      enable row level security;

-- อาจารย์ (authenticated) อ่านได้ทุกตาราง
create policy teacher_read_students  on public.students          for select to authenticated using (true);
create policy teacher_read_sessions  on public.sessions          for select to authenticated using (true);
create policy teacher_read_checkins  on public.check_ins         for select to authenticated using (true);
create policy teacher_read_attempts  on public.check_in_attempts for select to authenticated using (true);

-- mutation ทุกอย่างผ่าน service role (route handler) → ไม่มี policy INSERT/UPDATE/DELETE

-- ============================================================
-- updated_at trigger สำหรับ students
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger students_touch_updated_at
  before update on public.students
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ทำให้ realtime publication ตามตาราง check_ins + check_in_attempts
-- ============================================================
alter publication supabase_realtime add table public.check_ins;
alter publication supabase_realtime add table public.check_in_attempts;
