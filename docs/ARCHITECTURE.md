# AS_ATD — Architecture

ระบบเช็คชื่อนักศึกษาภาควิชาสถิติประยุกต์ — สถาปัตยกรรมระดับระบบ

---

## 1. เป้าหมายและขอบเขต

### 1.1 เป้าหมาย
- อาจารย์เปิดหน้า dashboard ครั้งเดียวเห็นได้ทันทีว่าใครมา/ยังไม่มา (realtime)
- นักศึกษาเช็คชื่อด้วยการสแกน QR บนจอ → ใช้เวลา <5 วินาที
- กันโกง: เพื่อนสแกนแทนยากพอสมควร (rotating QR + geofence)
- Export ออกเป็น Excel เพื่อเอาไปประมวลผลต่อ

### 1.2 ขอบเขต (Scope)
- **In scope:** 1 อาจารย์, 1 วิชา, หลายคาบเรียนต่อเทอม, รายชื่อนักศึกษา import จาก Excel
- **Out of scope (เฟสนี้):** หลายอาจารย์, หลายวิชา, การลา/ใบลา, แจ้งเตือนผู้ปกครอง, mobile app

### 1.3 ข้อจำกัด (Constraints)
- ไม่มี server ของตัวเอง → ต้อง serverless ทั้งหมด
- งบ ~0 บาท → ต้องอยู่บน free tier ของทุกบริการ
- Deploy บน Vercel

---

## 2. ภาพรวมสถาปัตยกรรม (High-Level)

```
┌──────────────────────────────────────────────────────────────────┐
│                          Client (Browser)                         │
│                                                                   │
│  ┌────────────────────────┐    ┌──────────────────────────────┐ │
│  │ /admin (อาจารย์)         │    │ /checkin?t=xxx (นักศึกษา)    │ │
│  │ - Google OAuth           │    │ - กรอก student ID ครั้งแรก  │ │
│  │ - QR rotating display    │    │ - ขอ geolocation             │ │
│  │ - Realtime roster        │    │ - POST check-in              │ │
│  │ - Excel import/export    │    │                              │ │
│  └────────────┬─────────────┘    └──────────────┬───────────────┘ │
└───────────────┼─────────────────────────────────┼─────────────────┘
                │                                 │
                │ HTTPS                           │ HTTPS
                ▼                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Vercel (Edge / Serverless)                      │
│                                                                   │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Next.js Pages  │  │ Route Handlers  │  │ Middleware       │  │
│  │ (RSC + Client) │  │ /api/sessions   │  │ - Auth gate      │  │
│  │                │  │ /api/checkin    │  │ - Email domain   │  │
│  │                │  │ /api/token      │  │   check          │  │
│  └────────────────┘  └────────┬────────┘  └──────────────────┘  │
└──────────────────────────────┼───────────────────────────────────┘
                                │
                                │ HTTPS (Supabase JS Client + REST)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                            Supabase                               │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ PostgreSQL  │  │ Realtime     │  │ Auth (Google OAuth)  │    │
│  │ - students  │  │ - subscribe  │  │ - JWT issuance       │    │
│  │ - sessions  │  │   check_ins  │  │                      │    │
│  │ - check_ins │  │              │  │                      │    │
│  │ + RLS       │  │              │  │                      │    │
│  └─────────────┘  └──────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. การเลือก Tech Stack

| Layer            | เลือก                       | ทางเลือกที่ปฏิเสธ              | เหตุผล                                                  |
| ---------------- | --------------------------- | ------------------------------- | ------------------------------------------------------- |
| Framework        | Next.js 15 (App Router)     | Vite + React, SvelteKit         | คู่กับ Vercel ดีสุด, RSC ช่วยลดขนาด client bundle      |
| Language         | TypeScript (strict)         | JavaScript                       | ลดบั๊กตอน refactor, schema ยังจะโตอีก                  |
| UI               | Tailwind + shadcn/ui        | MUI, Chakra                      | bundle เล็ก, copy ลงโปรเจกต์ได้ ไม่ผูก lib version    |
| Database         | Supabase Postgres           | Vercel Postgres, Neon, Firebase | ต้องการ Realtime ในตัว + Auth + free tier ดีพอ        |
| Realtime         | Supabase Realtime           | Pusher, Ably, polling           | มากับ DB อยู่แล้ว, ฟรี, subscribe ตาม row-level filter |
| Auth             | Supabase Auth (Google)      | NextAuth, Clerk                  | อยู่ใน Supabase แล้ว ลด moving parts                  |
| Excel I/O        | SheetJS (`xlsx`)            | exceljs                          | ทำฝั่ง client ได้ ไม่กิน serverless function          |
| QR generation    | `qrcode` (canvas/svg)       | server-side image                | render ฝั่ง client เบาและ smooth ตอนหมุน              |
| Token            | JWT (HS256)                 | random opaque token              | verify ได้ stateless, ไม่ต้อง round-trip DB           |
| Hosting          | Vercel                      | Cloudflare Pages, Netlify        | requirement                                            |

---

## 4. องค์ประกอบหลัก (Components)

### 4.1 Admin Web App (`/admin/*`)
- **Pages:**
  - `/admin/login` — Google sign-in
  - `/admin/students` — import/edit รายชื่อ
  - `/admin/session/new` — สร้างคาบเรียนใหม่ (set ตำแหน่ง + radius)
  - `/admin/session/[id]` — หน้า live: QR + roster realtime
  - `/admin/sessions` — รายการคาบทั้งหมด + export
- **State:** Supabase JS client, React Query สำหรับ cache, Realtime channel ต่อ session
- **Auth guard:** Middleware ตรวจ JWT + email domain

### 4.2 Student Check-in Page (`/checkin`)
- หน้าเดียว, ไม่ต้อง login
- เก็บ `studentId` ใน `localStorage` (key: `as_atd:student_id`)
- ขอ `navigator.geolocation` (high accuracy)
- หาก token หมดอายุ/ผิด: แสดงข้อความ "QR หมดอายุ — ลองสแกนใหม่"

### 4.3 API Routes (Vercel Serverless)

| Route                          | Method | หน้าที่                                              | Auth |
| ------------------------------ | ------ | ---------------------------------------------------- | ---- |
| `/api/sessions`                | POST   | สร้าง session ใหม่ + บันทึก geofence                | อาจารย์ |
| `/api/sessions/:id/token`      | GET    | ออก JWT token ใหม่ (อายุ 20s) สำหรับ QR ปัจจุบัน    | อาจารย์ |
| `/api/sessions/:id/close`      | POST   | ปิดคาบ                                               | อาจารย์ |
| `/api/checkin`                 | POST   | รับ `{token, studentId, lat, lng, deviceHash}`      | public |
| `/api/students/import`         | POST   | bulk insert จาก Excel (parsed ฝั่ง client)         | อาจารย์ |

### 4.4 Database (Supabase Postgres)
- ตารางหลัก 3 ตาราง (รายละเอียดใน `DESIGN.md`)
- ใช้ **Row-Level Security (RLS)** จำกัด query: ทุก mutation ต้องผ่าน API route (service key)

### 4.5 Realtime Channel
- Admin หน้า session subscribe channel: `check_ins:session_id=eq.<uuid>`
- เมื่อ INSERT เข้ามา → push event → UI toggle ช่องนั้นเป็น ✅

---

## 5. Data Flow ที่สำคัญ

### 5.1 Flow: สร้างคาบเรียน
```
อาจารย์         Browser                  /api/sessions          Supabase
   │                │                          │                     │
   │─ "เริ่มคาบ" ──▶│                          │                     │
   │                │─ getGeolocation() ──────▶│                     │
   │                │◀──── lat, lng ───────────│                     │
   │                │─ POST {lat, lng, radius}─▶                     │
   │                │                          │─ INSERT session ───▶│
   │                │                          │◀── session_id ──────│
   │                │◀── session_id ───────────│                     │
   │                │─ redirect /session/[id] ─│                     │
```

### 5.2 Flow: เช็คชื่อ (Happy Path)
```
นศ.        Browser            /api/checkin                 Supabase
 │           │                      │                          │
 │ สแกน QR ─▶│                      │                          │
 │           │ (มี studentId         │                          │
 │           │  ใน localStorage)     │                          │
 │           │─ getGeolocation() ───▶                          │
 │           │◀ lat, lng              │                          │
 │           │─ POST {t, sid, lat,lng}▶                         │
 │           │                      │─ verify JWT              │
 │           │                      │─ SELECT session ────────▶│
 │           │                      │◀ geofence info ──────────│
 │           │                      │─ haversine check         │
 │           │                      │─ INSERT check_in ───────▶│
 │           │                      │                          │ ┌── Realtime ──▶ Admin UI
 │           │◀── 200 OK ───────────│                          │ │
 │ "เช็คชื่อ ✅"│                     │                          │ │
```

### 5.3 Flow: QR Rotation
- Admin UI poll `/api/sessions/:id/token` ทุก 18 วินาที (ก่อน token 20s หมดอายุ 2s)
- ทาง alternative: subscribe Supabase Realtime channel แทน polling — ลดภาระแต่ over-engineering สำหรับ 1 อาจารย์ → เลือก polling

---

## 6. ความปลอดภัย (Security Model)

### 6.1 Auth
- **อาจารย์:** Google OAuth ผ่าน Supabase, allow-list เฉพาะ `@email.kmutnb.ac.th` (เช็คใน middleware)
- **นักศึกษา:** ไม่มี login → identity คือ student ID ที่กรอก (low trust → ชดเชยด้วย geofence + rotating token + 1-per-session rule)

### 6.2 กันโกง (Anti-cheat)
| ภัยคุกคาม                              | มาตรการ                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| ถ่ายรูป QR ส่งเพื่อน                    | Rotating JWT อายุ 20s + token ใช้ได้ครั้งเดียวต่อ student   |
| สแกนจากนอกห้อง                          | Geofence (รัศมี ~50m, configurable)                          |
| เพื่อนเช็คให้ (ยืม ID)                  | Device fingerprint log → flag ถ้า student เปลี่ยนเครื่อง   |
| Replay attack                          | JWT มี `iat` + nonce, server cache nonce 30s                  |
| Mass spoofing geolocation              | ยอมรับว่าทำได้ — เป็น undergrad cheat ลึกระดับ dev เท่านั้น  |

### 6.3 RLS
- `students`, `sessions`, `check_ins`: deny all by default
- ทุก mutation ผ่าน Route Handler ใช้ **service role key** (เก็บใน `SUPABASE_SERVICE_ROLE_KEY` env)
- Anon key เปิดให้ admin client SELECT ตามเงื่อนไข `auth.uid()` (สำหรับ realtime subscription)

### 6.4 Secrets
- `.env.local` (dev) + Vercel Project Env (prod)
- Keys: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_EMAIL_DOMAIN`

---

## 7. Deployment

### 7.1 Environments
- **dev:** localhost + Supabase project แยก (suffix `-dev`)
- **prod:** Vercel + Supabase project หลัก
- ไม่มี staging (overkill)

### 7.2 CI/CD
- Vercel auto-deploy จาก branch `main`
- Preview deploy ต่อ PR
- Database migrations: ใช้ Supabase CLI (`supabase db push`) — รัน manual ก่อน merge

### 7.3 Monitoring
- Vercel Analytics (built-in)
- Supabase Dashboard สำหรับ DB metrics
- ไม่ทำ alerting เฟสแรก

---

## 8. Free Tier Budget Check

| Service   | Free tier ที่ใช้                | คาดการณ์การใช้งาน                                    |
| --------- | -------------------------------- | --------------------------------------------------- |
| Vercel    | 100GB bandwidth, 100k invocations | คาบละ ~50 invocation × 30 คาบ/เทอม = 1,500 → ผ่าน |
| Supabase  | 500MB DB, 2GB bandwidth, 50k MAU | <1MB ต่อเทอม, อาจารย์คนเดียว → ผ่านสบาย              |
| Google OAuth | unlimited (consumer)          | -                                                   |

---

## 9. ความเสี่ยงและข้อจำกัด

| ความเสี่ยง                                  | ผลกระทบ                          | การรับมือ                                  |
| ------------------------------------------- | -------------------------------- | ------------------------------------------ |
| Geolocation บน iPhone Safari แม่นยำต่ำ      | นศ. ที่นั่งริมห้องอาจ check-in ไม่ผ่าน | radius default 50m, อาจารย์ปรับเพิ่มต่อ session ได้   |
| นศ. ไม่ให้สิทธิ์ location                    | check-in ไม่ได้                  | block check-in + แสดงข้อความให้เปิดสิทธิ์ location  |
| Supabase Realtime เสีย                       | dashboard ไม่อัปเดต              | fallback polling ทุก 5s                    |
| Free tier เกิน (เทอมถัดไป โต)               | service หยุด                     | ติดตาม dashboard, ย้ายไป self-host ได้    |

---

## 10. ข้อตกลงที่ confirm แล้ว

| Decision                          | Value                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Email domain (อาจารย์)            | `@email.kmutnb.ac.th`                                              |
| เกณฑ์สาย                          | 15 นาทีหลัง `started_at` → status = `late`                         |
| Geofence radius                   | default 50m; เกินรัศมี = reject + flag ว่า "พยายามโกง"            |
| ไม่ให้สิทธิ์ location              | flag (log) + block check-in นั้น                                  |
| เปิด session ซ้อน                 | ไม่อนุญาต — ต้องปิด session ก่อนหน้าก่อนสร้างใหม่                |
| นศ. drop กลางเทอม                 | mark `is_active = false` (ไม่ลบ — เก็บประวัติ check-in ไว้)        |
