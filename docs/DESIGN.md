# AS_ATD — Design Document

เอกสารออกแบบเชิงรายละเอียด: database schema, API contract, UI flow, validation rules, edge cases

> อ่าน `ARCHITECTURE.md` ก่อนเพื่อเข้าใจภาพรวมระบบ

---

## 1. Database Schema

### 1.1 ตาราง `students`

```sql
CREATE TABLE students (
  student_id   text         PRIMARY KEY,        -- รหัสนักศึกษา (เช่น "65130500001")
  first_name   text         NOT NULL,
  last_name    text         NOT NULL,
  nickname     text,
  major        text         NOT NULL,           -- สาขา
  section      text         NOT NULL,           -- sec (เช่น "1", "2")
  is_active    boolean      NOT NULL DEFAULT true,  -- false = drop วิชาแล้ว
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_section ON students(section);
CREATE INDEX idx_students_active ON students(is_active);
```

**หมายเหตุ:** `student_id` เป็น natural key — ไม่ใช้ UUID เพราะอ้างอิงจาก Excel ตรงๆ ได้ง่ายกว่า

### 1.2 ตาราง `sessions`

```sql
CREATE TABLE sessions (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text          NOT NULL,           -- "คาบที่ 1 — 28 มิ.ย. 2026"
  started_at          timestamptz   NOT NULL DEFAULT now(),
  ended_at            timestamptz,                      -- NULL = ยังเปิดอยู่
  -- Geofence
  lat                 double precision NOT NULL,
  lng                 double precision NOT NULL,
  radius_meters       integer       NOT NULL DEFAULT 50,
  -- Late policy
  late_after_minutes  integer       NOT NULL DEFAULT 15,
  -- Audit
  created_by          uuid          NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
```

### 1.3 ตาราง `check_ins`

```sql
CREATE TABLE check_ins (
  session_id    uuid          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id    text          NOT NULL REFERENCES students(student_id),
  checked_at    timestamptz   NOT NULL DEFAULT now(),
  status        text          NOT NULL CHECK (status IN ('present', 'late')),
  lat           double precision,
  lng           double precision,
  distance_m    integer,                                -- ระยะจากจุดศูนย์กลาง (debugging)
  device_hash   text,                                   -- SHA-256(userAgent + canvasFingerprint)
  PRIMARY KEY (session_id, student_id)                  -- ⬅ บังคับ 1 check-in ต่อคาบ
);

CREATE INDEX idx_checkins_student ON check_ins(student_id);

-- ตารางบันทึกความพยายามที่ถูก reject (สำหรับ flag โกง / ขอ override)
CREATE TABLE check_in_attempts (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id    text,                                   -- nullable: อาจกรอกผิด
  attempted_at  timestamptz   NOT NULL DEFAULT now(),
  reason        text          NOT NULL,                 -- 'out_of_geofence', 'no_location', ...
  lat           double precision,
  lng           double precision,
  distance_m    integer,
  device_hash   text,
  user_agent    text
);

CREATE INDEX idx_attempts_session ON check_in_attempts(session_id);
```

### 1.4 View: `attendance_pivot` (สำหรับ export รวมทั้งเทอม)

```sql
CREATE VIEW attendance_pivot AS
SELECT
  s.student_id,
  s.first_name, s.last_name, s.nickname, s.major, s.section,
  jsonb_object_agg(
    sess.id::text,
    jsonb_build_object(
      'session_name', sess.name,
      'status', ci.status,
      'checked_at', ci.checked_at
    )
  ) FILTER (WHERE ci.session_id IS NOT NULL) AS sessions
FROM students s
LEFT JOIN check_ins ci ON ci.student_id = s.student_id
LEFT JOIN sessions sess ON sess.id = ci.session_id
GROUP BY s.student_id;
```

### 1.5 Row-Level Security

```sql
ALTER TABLE students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins  ENABLE ROW LEVEL SECURITY;

-- อาจารย์ (authenticated) อ่านได้ทั้งหมด
CREATE POLICY teacher_read_students  ON students  FOR SELECT TO authenticated USING (true);
CREATE POLICY teacher_read_sessions  ON sessions  FOR SELECT TO authenticated USING (true);
CREATE POLICY teacher_read_checkins  ON check_ins FOR SELECT TO authenticated USING (true);

-- mutation ทั้งหมดต้องผ่าน service role (API route) → ไม่ต้องมี policy INSERT/UPDATE/DELETE
```

---

## 2. API Contract

ทุก endpoint คืน JSON, error format มาตรฐาน:
```json
{ "error": { "code": "TOKEN_EXPIRED", "message": "QR หมดอายุ" } }
```

### 2.1 `POST /api/sessions`
**Auth:** Bearer JWT ของอาจารย์ (Supabase session)

Request:
```json
{
  "name": "คาบที่ 3 — 5 ก.ค. 2026",
  "lat": 13.7563,
  "lng": 100.5018,
  "radius_meters": 50,
  "late_after_minutes": 15
}
```

Response (201):
```json
{
  "id": "uuid",
  "name": "...",
  "started_at": "2026-07-05T08:00:00Z"
}
```

### 2.2 `GET /api/sessions/:id/token`
**Auth:** อาจารย์

Response:
```json
{
  "token": "eyJhbGciOi...",
  "expires_at": "2026-07-05T08:00:20Z"
}
```

JWT payload:
```json
{
  "sid": "<session_id>",
  "iat": 1735977600,
  "exp": 1735977620,
  "nonce": "16-char-random"
}
```

### 2.3 `POST /api/checkin`
**Auth:** public

Request:
```json
{
  "token": "eyJhbGci...",
  "student_id": "65130500001",
  "lat": 13.75635,
  "lng": 100.50182,
  "device_hash": "a1b2c3..."
}
```

Response (200):
```json
{
  "status": "present",        // หรือ "late"
  "checked_at": "2026-07-05T08:02:13Z",
  "session_name": "คาบที่ 3 — 5 ก.ค. 2026"
}
```

Error codes:
| code                  | สาเหตุ                                       |
| --------------------- | -------------------------------------------- |
| `TOKEN_EXPIRED`       | JWT หมดอายุ → ให้สแกนใหม่                  |
| `TOKEN_INVALID`       | ลายเซ็นผิด/แก้ payload                       |
| `NONCE_REUSED`        | token นี้ถูกใช้ไปแล้ว                         |
| `STUDENT_NOT_FOUND`   | student_id ไม่มีในระบบ                       |
| `ALREADY_CHECKED_IN`  | เช็คชื่อ session นี้แล้ว                     |
| `OUT_OF_GEOFENCE`     | อยู่ไกลเกิน radius → flag เป็น suspicious      |
| `NO_LOCATION`         | นศ. ไม่ให้สิทธิ์ location → flag + block      |
| `SESSION_CLOSED`      | คาบปิดแล้ว                                   |
| `STUDENT_INACTIVE`    | student ถูก mark `is_active=false` (drop)    |
| `CONCURRENT_SESSION`  | มี session อื่นยังเปิดอยู่ — ปิดก่อน         |

### 2.4 `POST /api/sessions/:id/close`
**Auth:** อาจารย์
- เซ็ต `ended_at = now()`
- หลังจากนี้ check-in ที่เข้ามาจะถูกปฏิเสธด้วย `SESSION_CLOSED`

### 2.5 `POST /api/students/import`
**Auth:** อาจารย์

Request:
```json
{
  "students": [
    { "student_id": "...", "first_name": "...", "last_name": "...",
      "nickname": "...", "major": "...", "section": "..." }
  ],
  "mode": "upsert"   // หรือ "replace_all"
}
```

Response:
```json
{ "inserted": 30, "updated": 5, "errors": [] }
```

---

## 3. Business Rules

### 3.1 การคำนวณสถานะ (status)
```
delta = checked_at - session.started_at
if delta <= session.late_after_minutes:
  status = "present"
else:
  status = "late"
```

### 3.2 การคำนวณระยะ (Haversine)
```ts
function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const φ1 = a.lat * Math.PI / 180;
  const φ2 = b.lat * Math.PI / 180;
  const dφ = (b.lat - a.lat) * Math.PI / 180;
  const dλ = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

### 3.3 Device fingerprint
- `SHA-256(userAgent || canvasFingerprint || screen.width + 'x' + screen.height)`
- ไม่ใช้กัน hard เพราะ spoofed ได้ — แค่ log เพื่อ audit ภายหลัง

### 3.4 Nonce cache (กัน replay)
- เก็บใน Postgres ตาราง `token_nonces (nonce text PK, used_at timestamptz)`
- TTL 30 วินาที (cron clean หรือ delete ตอน insert ใหม่)
- Alternative ที่เบากว่า: Upstash Redis — ยังไม่ทำ เพราะเพิ่ม dependency

---

## 4. UI Flow

### 4.1 หน้า Admin — Live Session (`/admin/session/[id]`)

**Layout แบบจองตั๋วหนัง:** นักศึกษาแต่ละคนเป็น "ที่นั่ง" (icon คน) เรียงเป็น grid แบ่งตาม section คล้ายผังที่นั่งโรงหนัง สีของ icon แสดงสถานะ — เห็นภาพรวมห้องในตาเดียว

```
┌────────────────────────────────────────────────────────────────────────┐
│ คาบที่ 3 — 5 ก.ค. 2026 · 14:00                  [ปิดคาบ] [Export ▾]   │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  มา 30  สาย 3  ขาด 12  พยายามโกง 2                  │
│  │              │  ─────────────────────────────────────                │
│  │  ▓ QR ▓▓▓▓  │  Filter:  [ทั้งหมด ▾] [Sec ทั้งหมด ▾] [🔍 ค้นชื่อ...]│
│  │  ▓▓▓▓▓▓▓▓▓  │  Legend:  🟢 มา   🟡 สาย   ⚪ ยังไม่มา   🔴 flag    │
│  │  ▓▓ CODE ▓  │                                                        │
│  │  ▓▓▓▓▓▓▓▓▓  │  ── Sec 1 ────────────────── 18/22 ─────────────────  │
│  │              │   🟢   🟢   🟢   🟡   🟢   🟢   🟢   🟢   🟢   🟢   │
│  │ เปลี่ยน 12s   │   👤   👤   👤   👤   👤   👤   👤   👤   👤   👤   │
│  └──────────────┘  001  002  003  004  005  006  007  008  009  010   │
│                                                                         │
│   🔊 เสียงแจ้ง: ON     🟢   🟢   🟢   🟢   ⚪   ⚪   ⚪   🔴            │
│                        👤   👤   👤   👤   👤   👤   👤   👤            │
│                       011  012  013  014  015  016  017  018           │
│                                                                         │
│                       ── Sec 2 ────────────────── 12/23 ─────────────  │
│                        🟢   🟢   ⚪   🟢   🟡   🟢   ⚪   ⚪   ⚪      │
│                        👤   👤   👤   👤   👤   👤   👤   👤   👤      │
│                       101  102  103  104  105  106  107  108  109     │
└────────────────────────────────────────────────────────────────────────┘
```

**Seat states (สีของ icon คน):**

| สถานะ                | สี / icon                          | trigger                                  |
| -------------------- | ---------------------------------- | ---------------------------------------- |
| ยังไม่มา               | เทาอ่อน 👤 (`bg-slate-200`)         | initial                                  |
| มาตรงเวลา             | เขียว 👤 (`bg-emerald-500`)         | `check_ins.status = 'present'`           |
| สาย                  | เหลือง 👤 (`bg-amber-400`)          | `check_ins.status = 'late'`              |
| Flag พยายามโกง        | แดงกระพริบ 👤 (`bg-red-500 animate-pulse`) | row ใน `check_in_attempts` (รัศมีเกิน/ไม่ให้ location) |
| Inactive (drop วิชา) | ซ่อนจาก grid                       | `students.is_active = false`             |

**Interaction:**
- **Hover** ที่ icon → tooltip แสดง `รหัส · ชื่อ-สกุล (ชื่อเล่น) · เวลาเช็ค`
- **Click** ที่ icon → เปิด side panel / modal:
  ```
  ┌─────────────────────────────────────┐
  │ 👤 65130500003                       │
  │ สมศรี ดีงาม (จูน)                     │
  │ สาขาสถิติประยุกต์ · Sec 1            │
  │ ─────────────────────────────────── │
  │ สถานะ: 🟡 สาย                        │
  │ เช็คชื่อ: 14:18:45 (สาย 3 นาที)       │
  │ ระยะจากห้อง: 12m                     │
  │ device: chrome/android (a1b2…)      │
  │                                     │
  │ ประวัติเทอมนี้: มา 14 · สาย 2 · ขาด 1 │
  │                                     │
  │ [Override → มา] [Override → ขาด]    │
  └─────────────────────────────────────┘
  ```
- **Filter bar:**
  - dropdown สถานะ: ทั้งหมด / มา / สาย / ขาด / flag
  - dropdown sec: ทั้งหมด / 1 / 2 / ...
  - search ชื่อ/รหัส/ชื่อเล่น → grid กรองทันที (highlight match)

**Realtime behavior:**
- QR re-render ทุก 18s (poll `/api/sessions/:id/token`)
- Roster subscribe `check_ins:session_id=eq.<id>` และ `check_in_attempts:session_id=eq.<id>`
- เมื่อ event เข้า → icon เปลี่ยนสี + เด้ง subtle scale animation (200ms) + เสียง ping เบาๆ (toggle ได้)
- ตัวนับด้านบน (มา/สาย/ขาด/flag) อัปเดตทันที

### 4.2 หน้า Student — Check-in (`/checkin?t=...`)

**State 1: ครั้งแรก**
```
┌──────────────────────────┐
│   เช็คชื่อ                 │
│                          │
│  รหัสนักศึกษา              │
│  ┌──────────────────┐    │
│  │ 65130500___      │    │
│  └──────────────────┘    │
│                          │
│  [ ยืนยัน ]              │
│                          │
│  *ระบบจะจำรหัสไว้         │
│   ครั้งต่อไปไม่ต้องกรอกใหม่ │
└──────────────────────────┘
```

**State 2: กำลังตรวจ**
```
[ spinner ] กำลังตรวจตำแหน่ง...
```

**State 3: สำเร็จ**
```
✅ เช็คชื่อสำเร็จ
สมชาย ใจดี (โอม)
14:02 น. — มาตรงเวลา
```

**State 4: ผิดพลาด** (ตามแต่ละ error code)
- `OUT_OF_GEOFENCE`: "คุณอยู่นอกห้องเรียน (ระยะ 87m)"
- `TOKEN_EXPIRED`: "QR หมดอายุ — โปรดสแกนใหม่"
- `ALREADY_CHECKED_IN`: "เช็คชื่อแล้วเมื่อ 14:02"
- `STUDENT_NOT_FOUND`: "ไม่พบรหัสนักศึกษา — แจ้งอาจารย์"

### 4.3 หน้า Admin — Import Students

```
┌─────────────────────────────────────────┐
│ Import รายชื่อนักศึกษา                   │
├─────────────────────────────────────────┤
│                                         │
│  [📂 เลือกไฟล์ Excel (.xlsx)]            │
│                                         │
│  Preview (45 rows):                     │
│  ┌──────┬──────┬──────┬─────┬─────┬───┐│
│  │ ID   │ Name │ Sur  │ Nick│Major│Sec││
│  ├──────┼──────┼──────┼─────┼─────┼───┤│
│  │651..│สมชาย │ใจดี  │โอม  │สถิติ│ 1 ││
│  │651..│สมหญิง│ดีใจ  │ปราง │สถิติ│ 1 ││
│  └──────┴──────┴──────┴─────┴─────┴───┘│
│                                         │
│  ○ upsert (อัปเดตที่ซ้ำ)                  │
│  ○ replace all (ลบของเก่า)               │
│                                         │
│  [ยกเลิก]              [ยืนยัน import]   │
└─────────────────────────────────────────┘
```

---

## 5. Excel Format

### 5.1 Import Template

Header เป็นภาษาอังกฤษล้วน:

| ID          | Name   | Surname | Nickname | Major          | Sec |
| ----------- | ------ | ------- | -------- | -------------- | --- |
| 65130500001 | สมชาย  | ใจดี    | โอม      | สถิติประยุกต์   | 1   |
| 65130500002 | สมหญิง | ดีใจ    | มะปราง   | สถิติประยุกต์   | 1   |

**กฎ:**
- header row ต้องตรงทุกตัวอักษร (case-sensitive): `ID | Name | Surname | Nickname | Major | Sec`
- รับเฉพาะ sheet แรก
- `ID` ห้ามซ้ำในไฟล์เดียวกัน
- ค่าว่างใน `Nickname` ได้
- ค่าใน column อื่นเป็นภาษาไทยได้ (เป็น data, ไม่ใช่ header)

### 5.2 Export — Per Session

| รหัสนักศึกษา | ชื่อ   | นามสกุล | ชื่อเล่น | สาขา       | Sec | สถานะ      | เวลาเช็คชื่อ        |
| ------------ | ------ | ------- | -------- | ---------- | --- | ---------- | ------------------- |
| 65130500001  | สมชาย  | ใจดี    | โอม      | สถิติประยุกต์ | 1   | มา         | 5/7/2026 08:02:13   |
| 65130500002  | สมหญิง | ดีใจ    | มะปราง   | สถิติประยุกต์ | 1   | สาย        | 5/7/2026 08:18:45   |
| 65130500003  | สมศรี  | ดีงาม   | จูน      | สถิติประยุกต์ | 1   | ขาด        |                     |

### 5.3 Export — รวมทั้งเทอม (Pivot)

| รหัส        | ชื่อ-สกุล      | Sec | คาบที่ 1 | คาบที่ 2 | คาบที่ 3 | ... | รวมมา | รวมสาย | รวมขาด |
| ----------- | -------------- | --- | -------- | -------- | -------- | --- | ----- | ------ | ------ |
| 65130500001 | สมชาย ใจดี     | 1   | ✓        | ✓        | สาย      |     | 15    | 2      | 1      |
| 65130500002 | สมหญิง ดีใจ    | 1   | ✓        | ขาด      | ✓        |     | 16    | 0      | 2      |

---

## 6. Edge Cases & Decisions

| Case                                              | Decision                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| นศ. สแกนหลังคาบปิด                                | reject `SESSION_CLOSED` — ไม่ให้เช็คย้อนหลัง                       |
| อาจารย์เปิด 2 session ซ้อน                         | reject `CONCURRENT_SESSION` — ต้องปิด session เดิมก่อน              |
| นศ. drop วิชากลางเทอม                              | `is_active=false` — ซ่อนจาก grid + reject `STUDENT_INACTIVE` ถ้าพยายามเช็ค |
| นศ. ปฏิเสธ permission location                    | reject `NO_LOCATION` + บันทึก `check_in_attempts` (flag แดง)        |
| นศ. อยู่นอก radius                                 | reject `OUT_OF_GEOFENCE` + บันทึก attempt + flag "พยายามโกง"      |
| นศ. เปลี่ยนเครื่อง (device_hash ต่าง)             | อนุญาต check-in แต่ log flag ใน `check_ins.device_hash` ให้เห็น  |
| อาจารย์ลืมปิดคาบ                                  | auto-close หลัง 4 ชม. (cron หรือ on read check)                  |
| Realtime หลุด                                     | client poll `/api/sessions/:id/checkins` ทุก 5s เป็น fallback    |
| Time skew บน client                                | server เป็น source of truth — ใช้ `checked_at = now()` ฝั่ง DB    |
| นศ. ปิด JS                                        | ไม่ support — หน้า static แสดงข้อความให้เปิด JS                  |
| นศ. browser ไม่ support geolocation               | reject พร้อมข้อความ "อัพเดท browser หรือใช้เครื่องอื่น"            |
| Excel มีคอลัมน์เกิน                               | ignore คอลัมน์ที่ไม่รู้จัก                                         |
| Excel มี student_id ซ้ำกับใน DB ตอน `replace_all` | DELETE ทั้ง table ก่อน INSERT — เตือน 2 ครั้งใน UI                |

---

## 7. โครงสร้างโปรเจกต์ (เสนอ)

```
.
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx              # auth guard
│   │   ├── login/page.tsx
│   │   ├── students/page.tsx
│   │   ├── session/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx       # live dashboard
│   │   └── sessions/page.tsx
│   ├── checkin/page.tsx            # นศ. หน้าเดียว
│   └── api/
│       ├── sessions/route.ts
│       ├── sessions/[id]/
│       │   ├── token/route.ts
│       │   └── close/route.ts
│       ├── checkin/route.ts
│       └── students/import/route.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # browser client (anon)
│   │   ├── server.ts               # server client (service role)
│   │   └── realtime.ts
│   ├── geo.ts                      # haversine
│   ├── token.ts                    # JWT sign/verify + nonce
│   ├── fingerprint.ts
│   └── excel.ts                    # SheetJS wrappers
├── components/
│   ├── qr-display.tsx
│   ├── roster-list.tsx
│   └── ui/                         # shadcn
├── supabase/
│   ├── migrations/                 # SQL files
│   └── seed.sql
├── docs/
│   ├── ARCHITECTURE.md
│   └── DESIGN.md
└── middleware.ts                   # email domain gate
```

---

## 8. Phased Delivery

### Phase 1 — MVP (1 สัปดาห์)
- [ ] Schema + RLS
- [ ] Google OAuth + email domain gate
- [ ] Import students จาก Excel
- [ ] สร้าง/ปิด session
- [ ] QR rotating + checkin API
- [ ] Geofence + dup-check
- [ ] Realtime roster
- [ ] Export per-session

### Phase 2 — Polish
- [ ] Pivot export ทั้งเทอม
- [ ] Edit/delete student records
- [ ] Manual override (อาจารย์เพิ่ม/ลบ check-in ด้วยมือ)
- [ ] Dark mode

### Phase 3 — Nice to have
- [ ] PWA install
- [ ] Notification เสียง + vibrate ตอน checkin
- [ ] หน้าสรุปสถิติรายคน (ใครขาดเยอะ)

---

## 9. ข้อตกลงที่ lock แล้ว

| #  | Decision                | Value                                                          |
| -- | ----------------------- | -------------------------------------------------------------- |
| 1  | Email domain (อาจารย์)  | `@email.kmutnb.ac.th`                                          |
| 2  | `late_after_minutes`    | 15                                                             |
| 3  | Geofence radius         | 50m default; เกิน → reject + flag "พยายามโกง"                 |
| 4  | ไม่ให้สิทธิ์ location    | reject + flag (บันทึก `check_in_attempts`)                    |
| 5  | Concurrent session       | ไม่อนุญาต — reject `CONCURRENT_SESSION`                       |
| 6  | นศ. drop กลางเทอม        | `is_active=false` (ไม่ลบ row, ไม่แสดงใน grid)                 |

พร้อมเริ่ม implement Phase 1 ได้
