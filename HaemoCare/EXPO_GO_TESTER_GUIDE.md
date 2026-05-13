# HaemoCare — iPhone Tester Guide (Expo Go preview) | คู่มือทดสอบบน iPhone

> **This is a pre-release preview running inside Expo Go.** It only works while the developer's machine is running the bundler. Push notifications and over-the-air updates are disabled in this build. Treat any "update available" prompt as a known quirk and ignore it.
>
> **นี่คือเวอร์ชันพรีวิวที่รันใน Expo Go** ใช้งานได้เฉพาะช่วงที่นักพัฒนาเปิด bundler อยู่ การแจ้งเตือนแบบ push และการอัปเดตอัตโนมัติถูกปิดในเวอร์ชันนี้ หากมีแจ้งเตือน "มีการอัปเดต" ระหว่างเซสชัน ขอให้ละไว้

---

## English

### Step-by-step

1. **Install Expo Go** from the App Store: [apps.apple.com/app/expo-go/id982107779](https://apps.apple.com/app/expo-go/id982107779)
2. **Open this link on your iPhone** (sent to you separately by the developer): `<tunnel URL — filled in at session time>`
   - Or open Expo Go, tap **Scan QR Code**, and scan the QR the developer shares.
3. Wait for HaemoCare to load (a few seconds on first launch).

### Sign in

You have two options:

**A. Demo account (read-only, resets automatically):**
- Email: `demo@haemocare.app`
- Password: `HaemoDemo2024`

**B. Real account:**
- Tap **Create Account**, enter your email, and complete the profile (blood type, antibodies, known reactions, current medications, transfusion interval).
- Read and accept the **PDPA consent** screen.

### What to test

- Logging a transfusion
- Logging a symptom
- Opening your **Medical Passport** screen
- Sharing or printing your passport
- Editing your profile in **Settings**

### Known quirks during this preview

| What you see | What it means |
|---|---|
| "Expo Go" branding at the top of the screen | Normal — you're inside Expo Go. |
| "Update available" prompt in Passport or Settings | Ignore — version detection is confused inside Expo Go. |
| Tester link stops working partway through | The developer's bundler has stopped. Message them to restart. |
| No push notifications | Expected. Push is disabled in this preview. |

### Troubleshooting

| Problem | Solution |
|---|---|
| Expo Go shows "Something went wrong" | Pull down to reload, or close and re-open the tunnel link. |
| Link won't open | Make sure Expo Go is installed first, then tap the link again. |
| App is very slow on first load | Normal — first launch downloads the bundle. Subsequent loads are fast. |

### Privacy

HaemoCare stores your data in **Supabase** (cloud-hosted, Thailand data region). Only you can access your records. Delete your account anytime from **Settings → Privacy & Data → Delete Account**. Complies with Thailand's **PDPA**.

---

## ภาษาไทย

### ขั้นตอน

1. **ติดตั้ง Expo Go** จาก App Store: [apps.apple.com/app/expo-go/id982107779](https://apps.apple.com/app/expo-go/id982107779)
2. **เปิดลิงก์ที่นักพัฒนาส่งให้บน iPhone ของคุณ:** `<tunnel URL — ใส่ตอนเริ่มเซสชัน>`
   - หรือเปิด Expo Go แตะ **Scan QR Code** แล้วสแกน QR ที่นักพัฒนาส่งให้
3. รอให้ HaemoCare โหลด (ใช้เวลาสักครู่ในครั้งแรก)

### เข้าสู่ระบบ

มีสองทางเลือก:

**A. บัญชีสาธิต (อ่านอย่างเดียว รีเซ็ตอัตโนมัติ):**
- อีเมล: `demo@haemocare.app`
- รหัสผ่าน: `HaemoDemo2024`

**B. บัญชีจริง:**
- แตะ **สร้างบัญชี** กรอกอีเมล และกรอกโปรไฟล์ (หมู่เลือด แอนติบอดี ปฏิกิริยาที่เคยเกิด ยาที่ใช้ ระยะห่างการรับเลือด)
- อ่านและ **ยินยอม PDPA** เพื่อดำเนินการต่อ

### สิ่งที่ต้องการให้ทดสอบ

- บันทึกการรับเลือด
- บันทึกอาการ
- เปิดหน้า **Medical Passport**
- แชร์หรือพิมพ์ Passport
- แก้ไขโปรไฟล์ใน **การตั้งค่า**

### ข้อสังเกตในเวอร์ชันพรีวิวนี้

| สิ่งที่เห็น | ความหมาย |
|---|---|
| มีคำว่า "Expo Go" ที่ด้านบนของหน้าจอ | ปกติ — คุณกำลังใช้งานภายใน Expo Go |
| มีแจ้ง "มีการอัปเดต" ในหน้า Passport หรือ Settings | ละไว้ — การตรวจเวอร์ชันผิดพลาดเมื่ออยู่ใน Expo Go |
| ลิงก์หยุดทำงานกลางคัน | bundler ของนักพัฒนาหยุดทำงาน ขอให้แจ้งให้นักพัฒนาเริ่มใหม่ |
| ไม่มี push notification | คาดไว้แล้ว ปิดในเวอร์ชันพรีวิว |

### การแก้ไขปัญหาเบื้องต้น

| ปัญหา | วิธีแก้ไข |
|---|---|
| Expo Go แสดง "Something went wrong" | ลากลงเพื่อรีโหลด หรือปิดและเปิดลิงก์ใหม่ |
| ลิงก์ไม่เปิด | ตรวจสอบว่าติดตั้ง Expo Go แล้ว จากนั้นแตะลิงก์อีกครั้ง |
| โหลดช้ามากในครั้งแรก | ปกติ — ครั้งแรกต้องดาวน์โหลด bundle ครั้งถัดไปจะเร็วขึ้น |

### ความเป็นส่วนตัว

HaemoCare เก็บข้อมูลใน **Supabase** (คลาวด์ในประเทศไทย) เฉพาะคุณเท่านั้นที่เข้าถึงได้ ลบบัญชีได้ทุกเมื่อที่ **การตั้งค่า → ความเป็นส่วนตัวและข้อมูล → ลบบัญชี** เป็นไปตาม **พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)**
