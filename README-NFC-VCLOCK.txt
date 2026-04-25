VCLOCK + NFC CARD READER
========================

מה נוסף בגרסה הזו:
1. לא שונתה צורת ההתחברות למערכת.
2. במסך ניהול עובדים נוסף שדה: UID כרטיס NFC / RFID.
3. נוסף endpoint לשרת:
   POST /api/nfc/attendance
   body: { "uid": "04AABBCCDD" }
4. כאשר כרטיס משויך לעובד פעיל:
   - אם הדיווח האחרון של היום הוא כניסה -> נוצרת יציאה.
   - אחרת -> נוצרת כניסה.
5. הדיווח נשמר בטבלת attendance_records עם source_action = nfc_card.

קבצים מרכזיים ששונו:
backend/db.js
backend/server.js
frontend/src/pages/AdminUsersPage.jsx
backend/public/assets/index-cVgbPzw4.js

הפעלה:
1. הגדר DATABASE_URL כמו ב-VCLOCK המקורי.
2. התקן תלויות אם צריך:
   cd backend
   npm install
3. הרץ:
   npm start
4. כניסה למערכת רגילה נשארת עם שם משתמש וסיסמה.
5. עבור לניהול עובדים, ערוך עובד, והכנס UID של הכרטיס.

בדיקה ידנית מה-PowerShell:
curl -X POST http://localhost:3000/api/nfc/attendance -H "Content-Type: application/json" -d "{\"uid\":\"04AABBCCDD\"}"

חשוב:
ב-ESP יש להחליף את SERVER_URL ל-IP של המחשב או השרת שמריץ את VCLOCK.
לדוגמה:
http://192.168.1.100:3000/api/nfc/attendance
