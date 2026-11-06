# برنامه ۱۰ مدرسه طاها

اپلیکیشن وب مدرسه برای دانش‌آموزان پایه دهم — برنامه هفتگی و کارهای روزانه.

- **بدون نیاز به Node.js / npm / build**
- **قابل اجرا مستقیم روی GitHub Pages**
- **Backend: Firebase (Authentication + Firestore)**
- **طراحی Mobile-First و کاملاً Responsive**

---

## فایل‌های پروژه

```
├── index.html          # صفحه اصلی
├── style.css           # استایل‌ها
├── app.js              # منطق برنامه (ES Module)
├── firebase-config.js  # تنظیمات Firebase
├── firestore.rules     # قوانین امنیتی Firestore
├── firebase.json       # تنظیمات Firebase CLI (اختیاری)
├── .gitignore
└── README.md
```

---

## ۱. استقرار روی GitHub Pages

### گام‌ها:

1. یک Repository جدید در GitHub بسازید (مثلاً `taha-school-app`).
2. تمام فایل‌های این پوشه را در ریشه Repository قرار دهید.
3. Repository را **Public** کنید.
4. به مسیر بروید:
   ```
   Settings → Pages
   ```
5. در بخش **Source**:
   - Source: **Deploy from a branch**
   - Branch: **main** (یا master)
   - Folder: **/ (root)**
6. دکمه **Save** را بزنید.
7. بعد از ۱–۲ دقیقه سایت در آدرس زیر در دسترس است:
   ```
   https://YOUR_USERNAME.github.io/REPO_NAME/
   ```

> **نکته:** چون از مسیرهای نسبی (`./style.css` و `./app.js`) استفاده شده، پروژه هم در ریشه و هم در subpath درست کار می‌کند.

---

## ۲. تنظیم Firebase

### الف) ورود مدیر (رمز ساده)

ورود مدیر **بدون ایمیل** و فقط با رمز ثابت انجام می‌شود.

رمز پیش‌فرض:

```
taha1234
```

برای تغییر رمز، فایل `firebase-config.js` را باز کنید و مقدار `ADMIN_PASSWORD` را عوض کنید.

> این روش برای پروژه دانش‌آموزی ساده است. برای پروژه واقعی بهتر است از Firebase Authentication استفاده شود.

### ب) Firestore Database

1. وارد [Firebase Console](https://console.firebase.google.com/) شوید.
2. پروژه **taha-school-224e4** را باز کنید.
3. از منوی سمت چپ: **Build → Firestore Database**
4. اگر دیتابیس نساخته‌اید: **Create database** → حالت **Production mode** → منطقه را انتخاب کنید.
5. بعد از ایجاد، به تب **Rules** بروید.
6. محتوای فایل `firestore.rules` را کپی کرده و جایگزین قوانین فعلی کنید، سپس **Publish** بزنید.

محتوای قوانین (پروژه دانش‌آموزی — نوشتن برای همه باز است):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /lessons/{lessonId} {
      allow read, write: if true;
    }
    match /tasks/{taskId} {
      allow read, write: if true;
    }
  }
}
```

### ج) ایندکس‌های ترکیبی (Composite Indexes)

برای کوئری‌های مرتب‌سازی، ممکن است Firebase از شما ایندکس بخواهد.

اگر در کنسول مرورگر خطای `failed-precondition` دیدید:

1. لینک ساخت ایندکس که در پیام خطا آمده را باز کنید و **Create Index** بزنید.
2. یا دستی:

**Collection: lessons**
- Fields: `group` (Ascending), `dayOrder` (Ascending), `timeOrder` (Ascending)

**Collection: tasks**
- Fields: `group` (Ascending), `dayOrder` (Ascending)

> برنامه طوری نوشته شده که اگر ایندکس نباشد، به صورت خودکار بدون orderBy کار می‌کند و مرتب‌سازی سمت کلاینت انجام می‌شود.

---

## ۳. استفاده از برنامه

### دانش‌آموز

1. سایت را باز کنید.
2. رشته و شعبه را انتخاب کنید.
3. «ورود به برنامه» را بزنید.
4. از نوار پایین بین صفحات جابه‌جا شوید:
   - 🏠 خانه — خلاصه امروز
   - 📅 برنامه — برنامه هفتگی (تب روزها)
   - ✅ کارها — کارهای روزانه (فیلتر روز)
   - ⚙️ تنظیمات — تغییر کلاس

انتخاب کلاس در `localStorage` ذخیره می‌شود و دفعه بعد نیازی به انتخاب مجدد نیست.

### مدیر

1. در صفحه انتخاب کلاس، «ورود مدیر» را بزنید.
2. رمز را وارد کنید: `taha1234`
3. از تب‌ها:
   - **داشبورد** — آمار کلی
   - **برنامه کلاسی** — افزودن / ویرایش / حذف درس
   - **کارهای روزانه** — افزودن / ویرایش / حذف کار

---

## ۴. ساختار داده Firestore

### Collection: `lessons`

| فیلد       | نوع    | توضیح                          |
|------------|--------|--------------------------------|
| group      | string | مثلاً `دهم ریاضی شعبه 2`      |
| day        | string | شنبه، یکشنبه، ...              |
| dayOrder   | number | ۱ تا ۶                         |
| time       | string | مثلاً `08:00 - 09:30`          |
| timeOrder  | number | دقیقه از نیمه‌شب (برای مرتب‌سازی) |
| name       | string | نام درس                        |
| teacher    | string | نام معلم                       |
| updatedAt  | timestamp | زمان به‌روزرسانی            |

### Collection: `tasks`

| فیلد      | نوع    | توضیح                     |
|-----------|--------|---------------------------|
| group     | string | کلاس                      |
| day       | string | روز                       |
| dayOrder  | number | ۱ تا ۶                    |
| title     | string | عنوان کار                 |
| desc      | string | توضیح                     |
| updatedAt | timestamp | زمان به‌روزرسانی       |

---

## ۵. ویژگی‌ها

- به‌روزرسانی لحظه‌ای با `onSnapshot`
- کش آفلاین با IndexedDB Persistence
- پیام‌های فارسی برای خطاها و وضعیت‌ها
- طراحی شبیه اپلیکیشن موبایل با Bottom Navigation
- فرم‌های Modal برای افزودن/ویرایش
- تأیید قبل از حذف

---

## ۶. Firebase CLI (اختیاری)

اگر بخواهید قوانین را از طریق CLI مستقر کنید:

```bash
npm install -g firebase-tools
firebase login
firebase use taha-school-224e4
firebase deploy --only firestore:rules
```

**اجرای برنامه به CLI نیاز ندارد.** فقط فایل‌های استاتیک را روی GitHub Pages قرار دهید.

---

## ۷. نکات امنیتی

- ورود مدیر با رمز ساده در frontend انجام می‌شود (مناسب پروژه دانش‌آموزی).
- قوانین Firestore فعلاً نوشتن را برای همه باز گذاشته‌اند.
- API Key عمومی Firebase در frontend مجاز است.

---

## پشتیبانی

در صورت مشکل:
1. کنسول مرورگر (F12) را بررسی کنید.
2. مطمئن شوید Authentication و Firestore فعال هستند.
3. قوانین Firestore را Publish کرده باشید.
4. ایندکس‌های ترکیبی را در صورت نیاز بسازید.


## ۸. بخش «فایل‌ها و پروفایل‌ها» (نسخه جدید)

- مدیر از تب «فایل‌ها و پروفایل‌ها» ابتدا پروفایل معلم یا دانش‌آموز را همراه عکس و توضیح ثبت می‌کند.
- سپس عنوان، صاحب فایل، کلاس مقصد و جزوه/PDF/عکس/ویدئو یا Word/PowerPoint را انتخاب و منتشر می‌کند.
- دانش‌آموزان از تب پایین «فایل‌ها» پروفایل‌ها و منابع کلاس خود یا منابع عمومی را می‌بینند. ویدئو و عکس پیش‌نمایش دارند.
- سقف آپلود هر فایل آموزشی ۵۰ مگابایت و عکس پروفایل ۵ مگابایت است.

### راه‌اندازی Storage در Firebase

۱. Firebase Console → Build → Storage → Get started را بزنید و Storage را فعال کنید.
۲. در Storage → Rules، محتوای فایل `storage.rules` را قرار دهید و Publish کنید.
۳. در Firestore → Rules نیز محتوای به‌روز `firestore.rules` را Publish کنید (دو Collection جدید `profiles` و `resources` اضافه شده‌اند).
۴. در صورت استفاده از Firebase CLI، با `firebase deploy --only firestore:rules,storage` هر دو قانون را مستقر کنید.

### هشدار امنیتی مهم

نسخه فعلی پروژه ورود مدیر را فقط با یک رمز در کد مرورگر کنترل می‌کند و Firebase Authentication ندارد. بنابراین قوانین باز بالا صرفاً برای سازگاری با مدل فعلی پروژه هستند و **امنیت واقعی ایجاد نمی‌کنند**؛ هر فرد فنی می‌تواند مستقیماً به دیتابیس/Storage درخواست نوشتن بفرستد. پیش از انتشار عمومی یا نگهداری اطلاعات واقعی دانش‌آموزان، باید ورود مدیر به Firebase Authentication منتقل شود و قوانین Firestore و Storage فقط برای مدیر احراز هویت‌شده اجازه نوشتن بدهند. لینک فایل‌های Storage نیز در این نسخه از نوع download URL است؛ هرکس لینک را داشته باشد می‌تواند فایل را باز کند.
