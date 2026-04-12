VClock - Render Ready

מה עודכן:
- לוגו אמיתי נוסף למערכת ולמסך ההתחברות
- ה-frontend נבנה לתוך backend/public
- השרת מגיש את מסך ה-React ואת ה-API מאותו דומיין
- הקריאות ב-frontend תואמו ל-endpoints האמיתיים של השרת
- הוגדר Vite Proxy לפיתוח מקומי

התחברות לדמו:
מנהל: admin / 1234
עובד: 1001 / 1234

הפעלה מקומית ב-Windows:
1. חלץ את הקובץ
2. לחץ פעמיים על Start-VClock.bat
3. הדפדפן ייפתח ב-http://localhost:3000

עצירה:
- Stop-VClock.bat

פיתוח ידני:
1. frontend\npm install
2. frontend\npm run build
3. backend\npm install
4. backend\npm start

Render:
- הפרויקט כולל render.yaml
- יש ליצור Web Service מהריפו
- Build Command ו-Start Command מוגדרים כבר בקובץ

משתני סביבה מומלצים:
- PORT=3000
- JWT_SECRET=change-me
- DATABASE_URL=postgres-connection-string
