# บันทึกมิเตอร์น้ำ-ไฟ (Basis Meter App)

> ## 👉 ใช้เวอร์ชันนี้: `docs/index.html`
>
> เว็บแอปไฟล์เดียว เปิดได้ทุกคนไม่ต้องมีบัญชีอะไร ตั้งค่าด้วยการคลิกล้วน
> ไม่ต้องพิมพ์คำสั่งสักบรรทัด — **อ่านวิธีทำที่ [`docs/SETUP.md`](docs/SETUP.md)**
>
> โฮสต์ฟรีด้วย GitHub Pages + ฐานข้อมูล Firestore (ฟรี ไม่ต้องผูกบัตร)
> ทดสอบอัตโนมัติ 51 ข้อด้วย `npm install` แล้ว `node docs/e2e.mjs`
>
> <details><summary>อีก 2 เวอร์ชันในโปรเจกต์นี้ (ไม่ต้องใช้)</summary>
>
> - `artifact/meter-log.html` — เวอร์ชันรันบน Claude Artifacts
>   ใช้ได้เฉพาะคนที่มีบัญชี claude.ai ในองค์กรเดียวกัน
> - `src/` — เวอร์ชัน React + TypeScript + Firebase แบบ build ด้วย Vite
>   ยืดหยุ่นกว่าแต่ต้องใช้ command line ตามคู่มือด้านล่าง
> </details>


แอปสำหรับทีมช่างบันทึกค่ามิเตอร์น้ำ-ไฟฟ้าประจำวัน — ถ่ายรูป + พิมพ์เลขมิเตอร์
ครั้งเดียวในมือถือ ระบบคำนวณหน่วยที่ใช้ให้อัตโนมัติ ดูประวัติย้อนหลังได้ และ
ส่งออกสรุปรายเดือนเป็น CSV (เปิดด้วย Excel) ให้ฝ่ายบัญชีได้เลย ไม่ต้องจดกระดาษ
หรือคีย์ข้อมูลซ้ำ

รองรับช่าง 8 คนใช้งานพร้อมกันผ่านมือถือของตัวเอง (ติดตั้งเป็นแอปบนหน้าจอ
หลักได้ผ่าน PWA — "Add to Home Screen")

## สถาปัตยกรรม

- **Frontend**: React + TypeScript + Vite + Tailwind CSS, เป็น PWA
- **Backend**: Firebase (Firestore = ฐานข้อมูล, Storage = เก็บรูปภาพ,
  Hosting = โฮสต์เว็บ) — ไม่ต้องดูแลเซิร์ฟเวอร์เอง มี free tier ให้ใช้ฟรี
  เพียงพอสำหรับทีม 8 คน
- **ล็อกอิน**: เลือกชื่อช่าง + รหัส PIN 4 หลัก (ดูหัวข้อ "เรื่องความปลอดภัย"
  ด้านล่าง — ไม่ใช่ Firebase Auth เต็มรูปแบบ เหมาะกับทีมภายในเท่านั้น)
- **1 จุด บันทึกได้วันละ 1 ครั้ง**: ถ้าถ่ายซ้ำ/แก้เลขในวันเดียวกัน
  ระบบจะอัปเดตทับของเดิม ไม่สร้างรายการซ้ำ

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### 1. สร้างโปรเจกต์ Firebase

1. ไปที่ https://console.firebase.google.com → "Add project" → ตั้งชื่อ
   เช่น `basis-meter-app`
2. ในเมนูซ้าย เปิดใช้งาน **Firestore Database** (Build → Firestore
   Database → Create database → เลือก region ใกล้ไทย เช่น `asia-southeast1`)
3. เปิดใช้งาน **Storage** (Build → Storage → Get started → region เดียวกัน)
4. ไปที่ Project settings (ไอคอนเฟือง) → General → เลื่อนลงมา "Your apps"
   → กด `</>` (Web app) → ตั้งชื่อแอป → จะได้ค่า config (apiKey,
   authDomain, projectId, storageBucket, messagingSenderId, appId)

### 2. ตั้งค่าโปรเจกต์นี้

```bash
npm install
cp .env.example .env.local
# แก้ .env.local ใส่ค่าที่ได้จากขั้นตอนที่ 1
```

### 3. ติดตั้ง Firebase CLI และ deploy กฎความปลอดภัย + index

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # เลือกโปรเจกต์ที่สร้างไว้
firebase deploy --only firestore:rules,firestore:indexes,storage
```

ไฟล์ `firestore.rules` / `storage.rules` ที่แนบมาให้แล้วเหมาะกับแอปนี้
ไม่ต้องแก้ไข (อ่านคำอธิบายเรื่องความปลอดภัยด้านล่างประกอบ)

### 4. สร้างช่างคนแรก (bootstrap)

เพราะต้องล็อกอินก่อนถึงจะเข้าหน้า "ตั้งค่า" เพื่อเพิ่มช่างคนอื่นได้
ต้องสร้างช่างคนแรกด้วยมือใน Firebase Console ครั้งเดียว:

```bash
node scripts/hash-pin.mjs 1234
# จะได้ hash ยาวๆ ออกมา เช่น 03ac674216f3e1...
```

ไปที่ Firestore Database ใน Firebase Console → Start collection →
collection id: `technicians` → เพิ่ม document (ให้ Firestore สร้าง id
อัตโนมัติ) โดยมีฟิลด์:

| field | type | value |
|---|---|---|
| name | string | ชื่อช่างคนแรก เช่น "ช่างสมชาย" |
| pinHash | string | hash ที่ได้จากคำสั่งด้านบน |
| active | boolean | true |
| createdAt | number | 0 |

จากนั้นเข้าแอป เลือกชื่อนี้ ใส่ PIN ที่ตั้งไว้ → เข้าไปที่ "ตั้งค่า" เพื่อ
เพิ่มช่างที่เหลืออีก 7 คน และเพิ่มจุดมิเตอร์ 10 จุด (ชื่อจุด, ประเภท
ไฟฟ้า/น้ำ, หน่วย เช่น kWh / m³) ได้เลยจากในแอป ไม่ต้องยุ่งกับ Firebase
Console อีก

### 5. รันทดสอบ / deploy

```bash
npm run dev        # ทดสอบที่เครื่อง (เปิดจากมือถือในวงแลนเดียวกันได้ด้วย --host)
npm run build       # build สำหรับ production
firebase deploy --only hosting
```

หลัง deploy จะได้ URL แบบ `https://<project-id>.web.app` — ส่งลิงก์นี้ให้
ช่างทั้ง 8 คน เปิดในมือถือแล้วกด "Add to Home Screen" (Safari: ปุ่มแชร์ →
เพิ่มลงหน้าจอโฮม, Chrome: เมนู ⋮ → ติดตั้งแอป) จะได้ไอคอนเหมือนแอปจริง

## วิธีใช้งานประจำวัน

1. เปิดแอป → เลือกชื่อ → ใส่ PIN
2. หน้าหลักจะโชว์ 10 จุด แยกไฟฟ้า/น้ำ พร้อมสถานะว่าวันนี้บันทึกแล้วหรือยัง
3. แตะจุดที่จะบันทึก → ถ่ายรูปมิเตอร์ (ถ่ายได้หลายรูป) → พิมพ์เลขที่อ่านได้
   → ระบบโชว์เลขครั้งก่อนกับหน่วยที่ใช้ไปให้ทันที → กด "บันทึกข้อมูล"
4. ถ่ายรูปมั่ว/เลขผิด กลับมาแก้ได้ทั้งวัน (กด "แก้ไข / ถ่ายใหม่")
5. เมนู "ประวัติ" ดูย้อนหลังแยกตามเดือน/จุด พร้อมรูปถ่ายอ้างอิง
6. สิ้นเดือน เข้าเมนู "ส่งออก" เลือกเดือน กด "ดาวน์โหลดสรุปรายเดือน" ได้ไฟล์
   CSV เปิดด้วย Excel ส่งให้บัญชีได้เลย (มีอีกปุ่มดาวน์โหลดรายละเอียดรายวัน
   ถ้าบัญชีอยากเห็นทุกวัน)

รองรับกรณีสัญญาณเน็ตอ่อน (เช่น อยู่ในห้องไฟฟ้าใต้ดิน): ข้อมูลตัวเลขจะถูก
เก็บไว้ในเครื่องและส่งขึ้น Firestore อัตโนมัติเมื่อกลับมามีสัญญาณ ส่วนรูปภาพ
ถ้าอัปโหลดไม่สำเร็จให้ลองกด "บันทึกข้อมูล" ซ้ำอีกครั้งตอนสัญญาณกลับมา

## เรื่องความปลอดภัย (สำคัญ อ่านก่อนใช้งานจริง)

แอปนี้ตั้งใจออกแบบให้ **เรียบง่ายสำหรับทีมภายใน 8 คน** จึงใช้ PIN 4 หลัก
แทน Firebase Authentication เต็มรูปแบบ ผลคือ:

- Firestore/Storage security rules **เปิดกว้าง** (ใครก็ตามที่มีลิงก์แอป
  และเปิด devtools ดูค่า config สามารถอ่าน/เขียนข้อมูลได้โดยไม่ต้องผ่าน PIN)
  PIN ทำหน้าที่แค่ระบุตัวว่า "ใครเป็นคนบันทึก" ไม่ใช่ด่านความปลอดภัยจริง
- **อย่าเผยแพร่ลิงก์แอปต่อสาธารณะ** ส่งให้เฉพาะทีมช่าง 8 คนเท่านั้น
- ถ้าต้องการความปลอดภัยที่แน่นขึ้น (เช่น มีข้อมูลอ่อนไหวกว่านี้ หรือทีม
  ขยายใหญ่ขึ้น) แนะนำอัปเกรดเป็น Firebase Authentication (อีเมล/รหัสผ่าน
  รายคน) แล้วปรับ security rules ให้ตรวจ `request.auth` — โครงสร้างโค้ด
  ปัจจุบัน (`src/lib/auth.ts`) แยกส่วนล็อกอินไว้ต่างหากแล้ว ทำให้สลับได้
  ไม่ยาก

## โครงสร้างโปรเจกต์

```
src/
  lib/          Firebase init, auth/session, CRUD สำหรับ readings/points/technicians
  pages/        Login, Home, Record, History, Export, Settings
  components/   Header, BottomNav, PhotoCapture
firestore.rules, storage.rules, firestore.indexes.json   กฎ Firebase
scripts/hash-pin.mjs   คำนวณ PIN hash สำหรับสร้างช่างคนแรก
```
