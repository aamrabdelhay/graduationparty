# 🎓 منصة حفل التخرج — Graduation Party Platform

منصة كاملة لحفلات التخرج: تقديم عام بالصور، تركيب قبعة تخرج بالذكاء الاصطناعي، غرفة إدارة حقيقية بمسودات وتحكم لايف، وشاشة عرض (بروجكتور) بمزامنة لحظية عبر SSE.

## المزايا

- **الصفحة العامة `/`**: تقديم فردي أو جروب أصحاب، اسم رباعي، صورة طفولة + صورة حالية، تركيب القبعة بالـ AI فور الرفع، معاينة نهائية قبل التسليم.
- **غرفة الإدارة `/admin`**: بطاقات الخريجين بوقت التقديم بالثانية، تعديل/حذف/ترتيب/استبدال صور، مسودات سيرفر-سايد مع زرار حفظ، تذكير بالتعديلات غير المحفوظة بعد الخروج، كشف تعارض التعديل المزدوج (Optimistic Concurrency)، إعادة توليد القبعة عند الفشل، تصدير CSV/XLSX (أسامي فقط + نسخة احتياطية كاملة).
- **غرفة السلايد شو**: تحكم كامل (بدء/إيقاف/استكمال/تالي/سابق/تخطي/إعادة/قفز/ترتيب/توقيتات/وضع تلقائي) + قائمة «ورا السلايد شو» الخاصة بالمنظم فقط.
- **شاشة العرض `/screen?token=…`**: فريم تخرج فاخر، دخان Canvas يحوّل صورة الطفولة لصورة التخرج بالقبعة، كشف الاسم بأنيميشن، مزامنة لحظية SSE مع استرجاع الحالة بعد الريفرش. الشاشة لا ترى سوى اللقطة الحالية (توكن عشوائي قابل للإبطال).

## التشغيل محليًا

```bash
npm install
cp .env.example .env          # ثم عدّل القيم
npx drizzle-kit push          # إنشاء الجداول في PostgreSQL
npm run build && npm start    # أو npm run dev
```

كلمة مرور الإدارة الافتراضية: `cu` (غيّرها عبر `ADMIN_PASSWORD`).

## النشر على Vercel

### 1) ادفع الكود لـ GitHub

```bash
git init
git add -A
git commit -m "Graduation party platform"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

### 2) اربط المشروع في Vercel

Import الريبو من لوحة Vercel (أو `npx vercel link`) ثم:

### 3) متغيرات البيئة (Project → Settings → Environment Variables)

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط PostgreSQL إنتاجي (Vercel Postgres أو Neon أو Supabase) |
| `ADMIN_PASSWORD` | `cu` أو أي كلمة قوية |
| `BLOB_READ_WRITE_TOKEN` | توكن Vercel Blob (Storage → Create Store → Blob) |

> ⚠️ بدون `BLOB_READ_WRITE_TOKEN` ستُحفظ الصور في `/tmp` مؤقتًا وتُفقد — التوكن ضروري للإنتاج.
> اختياري: `GEMINI_API_KEY` لتوليد القبعة بنموذج Gemini الحقيقي (بدونه يعمل مركّب القبعة المدمج بدون أي مفاتيح).

### 4) تجهيز قاعدة البيانات الإنتاجية (مرة واحدة)

```bash
DATABASE_URL="postgresql://<PRODUCTION_URL>" npx drizzle-kit push
```

### 5) Deploy

```bash
npx vercel deploy --prod
```

أو تلقائيًا مع كل push على `main` إذا كان الربط مفعّلًا.

## البنية

```
src/
├── app/
│   ├── page.tsx                 # بوابة التقديم العامة
│   ├── admin/                   # الدخول + الداشبورد المحمي سيرفر-سايد
│   ├── screen/                  # شاشة البروجكتور (توكن فقط)
│   └── api/                     # stage, submissions, admin/*, presentation/*, media
├── components/                  # submit/*, admin/*, screen/*
├── lib/                         # auth, drafts, presentation (SSE), media (sharp+AI), export
└── db/                          # Drizzle schema + client
```

## الأمان

- حماية `/admin/*` سيرفر-سايد، باسورد لا يغادر السيرفر أبدًا، تقييد المحاولات (5 غلط = حظر دقيقتين).
- API البروجكتور يكشف اللقطة الحالية فقط — لا قوائم ولا صور أصلية ولا أنصاف بيانات.
- الخام الأصلي لا يُمس؛ نسخة التخرج أصل منفصل دائمًا، والحذف ينظّف كل الملفات.
