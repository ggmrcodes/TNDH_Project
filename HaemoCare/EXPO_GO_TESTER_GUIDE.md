# HaemoCare — Tester Guide (Expo Go preview) | คู่มือทดสอบ HaemoCare

> **This is an early-stage preview running inside Expo Go.** The dev server is hosted 24/7 on a private VPS (Cloudflare Tunnel at `expo.haemocare.app`), so you can open it any time from any network. Push notifications are not yet wired up; ignore any "update available" prompt — version detection is unreliable inside Expo Go.
>
> **นี่คือเวอร์ชันพรีวิวระยะแรกที่รันใน Expo Go** ระบบ dev ทำงานตลอด 24 ชั่วโมงบน VPS ส่วนตัว (Cloudflare Tunnel ที่ `expo.haemocare.app`) คุณเปิดใช้งานได้ทุกเมื่อจากเครือข่ายใดก็ได้ Push notification ยังไม่เปิดใช้ ขอให้ละข้อความ "มีการอัปเดต" หากปรากฏ

---

## English

### What you need (one-time)

1. **Install Expo Go** from the app store:
   - iPhone: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. That's it — no developer account, no laptop tether needed.

### Open the app

Newer versions of Expo Go removed the in-app "Enter URL" field, so use a deep link instead. Pick whichever is easier:

**Method A — Safari / Chrome link (easiest)**
1. Open your phone's browser → address bar → type or paste:
   ```
   exp://expo.haemocare.app
   ```
2. Tap Go → your phone will prompt "Open in Expo Go?" → tap **Open**.
3. HaemoCare loads (15-60 seconds on first launch while the bundle downloads).

**Method B — Notes / Messages link**
1. Open the iOS Notes app (or Messages, paste in a draft to yourself).
2. Type `exp://expo.haemocare.app` → tap the underlined link → "Open in Expo Go".

**Method C — QR code**
1. On any computer, generate a QR for the text `exp://expo.haemocare.app` (e.g. https://qr-code-generator.com).
2. Open your phone's Camera app → point at the QR → tap the "Open in Expo Go" banner.

After the first launch, the app stays in your Expo Go recent list — open it from there next time.

### Sign in

Two paths:

**A. Demo account** (instant, no signup, uses fake data — best for quick exploration)
- Email: `demo@haemocare.app`
- Password: `HaemoDemo2024`
- A clinician demo also exists: `demo-doctor@haemocare.app` / `HaemoDoc2024`

**B. Real account** (your data is saved to a real backend — best for end-to-end testing)
1. Tap **Sign Up** → enter your email + password → tap Sign Up.
2. The app navigates to Login. Sign in with the same email + password (email confirmation is disabled, so you can log in immediately).
3. Complete the profile form (full name, blood type, Rh factor, antibodies, known reactions, current medications, transfusion interval).
4. Accept the PDPA consent screen.

### What to try

- **Passport tab** — view your medical card; tap **Privacy & Data** (in the hero) to reach settings.
- **Sign out** — red icon in the top-right of the Passport screen. Tap → confirm in the popup.
- **Log Symptoms** — Symptom Monitor tab → "Log New". Try the 8 preset symptoms AND the **custom symptom input** at the bottom (type any label, tap +).
- **Add an Appointment** — Appointments tab → "Schedule New".
- **Add an Emergency Contact** — Passport tab → red "Add emergency contact" button → fill in name/phone.
- **Switch language** — TH/EN toggle in the top-right of most screens.

### What's known to be rough

| What you see | What it means |
|---|---|
| "Expo Go" branding banner at the top | Normal — you're inside Expo Go, not a packaged build. |
| App icon shows the Expo logo, not the HaemoCare droplet | Normal — custom icons only appear in packaged builds (TestFlight / APK), never in Expo Go. |
| Tap-target sometimes misses on first attempt after launch | Known — React Native warmup. Reload (shake → Reload) usually fixes it. |
| "Update available" prompt | Ignore — version detection is confused inside Expo Go. |
| Medication reminder notifications don't fire on iPhone in Expo Go | Expected — Expo Go on iOS (SDK 53+) does **not** deliver local notifications. The schedule is still saved and will fire correctly on the TestFlight build / packaged APK. Android Expo Go does deliver them. |

### Troubleshooting

| Problem | Try this |
|---|---|
| Tapping the `exp://` link does nothing | Install Expo Go first, then tap the link again. iOS sometimes needs a phone restart after a fresh install. |
| Expo Go shows "Something went wrong" / red screen | Shake the phone → tap **Reload**. Or close Expo Go and re-tap the link. |
| Stuck on splash screen for >2 minutes | Quit and reopen Expo Go, then re-open the link. First-ever bundle download can be slow on cellular. |
| Sign-up succeeded but login fails | Email confirmation should be off; if you see "Email not confirmed", message the developer — the Supabase setting needs flipping. |
| Profile completion errors out | Read the red error box — paste it to the developer. |

### Reporting issues

When something looks wrong, send the developer:
1. Screenshot
2. What you tapped just before
3. The exact error text (if any) from the red box

### Privacy

HaemoCare stores your data in **Supabase** (cloud-hosted). Only you can access your records. Sign out wipes the session from your phone; your data stays on the server. Delete your account entirely from **Privacy & Data → Delete Account**. Complies with Thailand's **PDPA**.

---

## ภาษาไทย

### สิ่งที่ต้องมี (ครั้งเดียว)

1. **ติดตั้ง Expo Go** จาก app store:
   - iPhone: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. แค่นี้พอ ไม่ต้องมีบัญชี developer หรือเปิดคอมที่ไหน

### เปิดแอป

Expo Go เวอร์ชันใหม่ตัด ช่อง "Enter URL" ออกแล้ว ให้ใช้ลิงก์ deep link แทน เลือกวิธีที่ง่ายที่สุด:

**วิธี A — ลิงก์ผ่าน Safari / Chrome (ง่ายที่สุด)**
1. เปิด browser บนมือถือ → ช่อง URL → พิมพ์หรือวาง:
   ```
   exp://expo.haemocare.app
   ```
2. แตะ Go → มือถือจะถาม "Open in Expo Go?" → แตะ **Open**
3. HaemoCare จะโหลด (15-60 วินาทีในครั้งแรก)

**วิธี B — ลิงก์ผ่านแอป Notes / Messages**
1. เปิดแอป Notes (หรือพิมพ์ใน Messages ถึงตัวเอง)
2. พิมพ์ `exp://expo.haemocare.app` → แตะลิงก์ที่ขีดเส้นใต้ → "Open in Expo Go"

**วิธี C — QR code**
1. ใช้คอมเปิดเว็บสร้าง QR (เช่น https://qr-code-generator.com) แล้วใส่ข้อความ `exp://expo.haemocare.app`
2. เปิด Camera บนมือถือ → ส่องไปที่ QR → แตะแบนเนอร์ "Open in Expo Go"

หลังเปิดครั้งแรก แอปจะอยู่ในรายการ "Recently opened" ของ Expo Go ใช้งานครั้งต่อไปเปิดจากตรงนั้นได้เลย

### เข้าสู่ระบบ

มี 2 ทาง:

**A. บัญชีสาธิต** (ใช้งานทันที ไม่ต้องสมัคร ใช้ข้อมูลจำลอง — เหมาะกับการสำรวจอย่างรวดเร็ว)
- อีเมล: `demo@haemocare.app`
- รหัสผ่าน: `HaemoDemo2024`
- บัญชีสาธิตของแพทย์: `demo-doctor@haemocare.app` / `HaemoDoc2024`

**B. บัญชีจริง** (ข้อมูลถูกบันทึกใน backend จริง — เหมาะกับการทดสอบ end-to-end)
1. แตะ **สมัครสมาชิก** → กรอกอีเมลและรหัสผ่าน → แตะสมัคร
2. แอปจะพากลับไปหน้า Login เข้าสู่ระบบด้วยอีเมล+รหัสผ่านชุดเดิมได้เลย (ปิดการยืนยันอีเมลไว้)
3. กรอกโปรไฟล์ (ชื่อ-นามสกุล หมู่เลือด Rh แอนติบอดี ปฏิกิริยาที่เคยเกิด ยาที่ใช้ ระยะห่างการรับเลือด)
4. ยินยอม PDPA

### สิ่งที่อยากให้ลอง

- **แท็บพาสปอร์ต** — ดูบัตรการแพทย์ แตะ **ความเป็นส่วนตัวและข้อมูล** ในการ์ดเพื่อเข้าหน้าตั้งค่า
- **ออกจากระบบ** — ไอคอนสีแดงมุมขวาบนของหน้าพาสปอร์ต แตะแล้วยืนยันใน popup
- **บันทึกอาการ** — แท็บบันทึก → "บันทึกอาการ" ลองทั้ง 8 อาการที่กำหนดไว้ **และช่องเพิ่มอาการอื่น** ที่อยู่ด้านล่าง (พิมพ์อะไรก็ได้ แล้วแตะ +)
- **เพิ่มนัดหมาย** — แท็บนัดหมาย → "เพิ่มนัดใหม่"
- **เพิ่มผู้ติดต่อฉุกเฉิน** — แท็บพาสปอร์ต → ปุ่ม "เพิ่มผู้ติดต่อฉุกเฉิน" สีแดง
- **เปลี่ยนภาษา** — ปุ่ม TH/EN มุมขวาบนของหน้าจอส่วนใหญ่

### สิ่งที่ยังไม่เรียบร้อย

| สิ่งที่เห็น | ความหมาย |
|---|---|
| แถบ "Expo Go" ด้านบนหน้าจอ | ปกติ — กำลังใช้งานใน Expo Go ไม่ใช่แอปแพ็กเกจ |
| ไอคอนแอปเป็นโลโก้ Expo ไม่ใช่หยดเลือดของ HaemoCare | ปกติ — ไอคอนจริงจะปรากฏเฉพาะใน build ที่แพ็กเกจ (TestFlight / APK) |
| ปุ่มกดไม่ติดในครั้งแรกหลังเปิดแอป | ทราบแล้ว — React Native warmup เขย่ามือถือ → Reload มักช่วยได้ |
| มีข้อความ "มีการอัปเดต" | ละไว้ — version detection สับสนเมื่ออยู่ใน Expo Go |
| การแจ้งเตือนทานยาไม่ทำงานบน iPhone ใน Expo Go | คาดว่าจะเกิด — Expo Go บน iOS (SDK 53+) ไม่ส่งการแจ้งเตือนภายในเครื่อง ตารางยังถูกบันทึกอยู่และจะแจ้งเตือนได้ถูกต้องใน TestFlight / APK ที่แพ็กเกจ ส่วน Expo Go บน Android ใช้งานได้ปกติ |

### การแก้ไขปัญหา

| ปัญหา | วิธีแก้ |
|---|---|
| แตะลิงก์ `exp://` แล้วไม่มีอะไรเกิดขึ้น | ติดตั้ง Expo Go ก่อน แล้วลองแตะลิงก์ใหม่ บางครั้งต้อง restart มือถือหลังติดตั้ง |
| Expo Go แสดง "Something went wrong" / หน้าจอแดง | เขย่ามือถือ → แตะ **Reload** หรือปิด Expo Go แล้วแตะลิงก์ใหม่ |
| ค้างที่หน้า splash นานกว่า 2 นาที | ปิดและเปิด Expo Go ใหม่ แล้วเปิดลิงก์อีกครั้ง การโหลดครั้งแรกอาจช้าบน cellular |
| สมัครสำเร็จแต่ login ไม่ได้ | ถ้าเห็น "Email not confirmed" แจ้งนักพัฒนา ต้องไปปิดสวิตช์ใน Supabase |
| Profile completion error | อ่านข้อความสีแดงในกล่อง แล้วส่งให้นักพัฒนา |

### การรายงานปัญหา

เวลาเจอปัญหา ส่งให้นักพัฒนา:
1. ภาพหน้าจอ
2. กดอะไรก่อนหน้านั้น
3. ข้อความ error ในกล่องสีแดง (ถ้ามี)

### ความเป็นส่วนตัว

HaemoCare เก็บข้อมูลใน **Supabase** (cloud) เฉพาะคุณเท่านั้นที่เข้าถึงได้ การออกจากระบบจะลบ session บนมือถือเท่านั้น ข้อมูลยังอยู่บนเซิร์ฟเวอร์ หากต้องการลบบัญชีทั้งหมดให้ไปที่ **ความเป็นส่วนตัวและข้อมูล → ลบบัญชี** เป็นไปตาม **พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)**
