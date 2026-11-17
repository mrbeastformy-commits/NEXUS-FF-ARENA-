# NEXUS FF ARENA & NEXUS FF ADMIN — Deployment & Mobile Install Guide

This guide explains in simple steps how to run the project locally, publish it to a public **HTTPS** link (required for phone installation), install both **NEXUS FF ARENA** and **NEXUS FF ADMIN** on Android/iPhone, and optionally package an **Android APK / AAB** using PWABuilder.

---

## 1. Run Locally on Your Computer

Requirements: **Node.js 22+** and **npm**.

```bash
# 1. Install all dependencies
npm install

# 2. Create your local environment file from the template
cp .env.example .env
# Edit .env and fill in OWNER_ADMIN_ALLOWLIST, FIREBASE_SERVICE_ACCOUNT_JSON, and APP_URL

# 3. Start in development mode (http://localhost:3000)
npm run dev
```

To test the **production build** locally:

```bash
npm run build
npm start
```

- Player App (**NEXUS FF ARENA**): `http://localhost:3000/`
- Admin App (**NEXUS FF ADMIN**): `http://localhost:3000/admin`

---

## 2. Environment Variables Checklist (Before Deploying)

Set these environment variables in your hosting dashboard (Render, Railway, Cloud Run, Fly.io, etc.):

| Variable | Required? | What to Put |
| --- | --- | --- |
| `OWNER_ADMIN_ALLOWLIST` | **Yes** | Your Owner Google/Firebase email address (comma-separated if more than one). Only listed verified accounts get Owner Admin access. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Yes** | Paste the entire single-line JSON from Firebase Console → Project Settings → Service Accounts → **Generate new private key**. |
| `APP_URL` | **Yes** | Your public HTTPS deployment URL (example: `https://nexus-ff-arena.onrender.com`). No trailing `/`. |
| `NODE_ENV` | **Yes** | Set to `production` when deployed. |
| `PORT` | Auto/3000 | Hosting providers usually set this automatically (defaults to `3000`). |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY` | Optional | Only if you enable Firebase App Check. |
| `VITE_FIREBASE_VAPID_KEY` | Optional | Only if you enable Web Push notifications. |

### Firebase Authorized Domains (Important!)
After deploying, open **Firebase Console → Authentication → Settings → Authorized domains** and add your new public domain (for example `nexus-ff-arena.onrender.com`) so Google Sign-In works on phones.

---

## 3. Publish on a Public HTTPS Link (Beginner Steps)

Phones **require HTTPS** before allowing "Install App" (PWA). Any Node.js host below gives you free automatic HTTPS:

### Option A: Render / Railway (Easiest)
1. Upload this project folder to a private GitHub repository (make sure `.env` is NOT committed).
2. Create a new **Web Service** connected to your repository.
3. Set the build and start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add all required environment variables from Section 2 (`OWNER_ADMIN_ALLOWLIST`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `APP_URL`, `NODE_ENV=production`).
5. Click **Deploy**. Once live, copy your `https://...` link and put it into `APP_URL` and Firebase Authorized Domains.

### Option B: Google Cloud Run
1. Build and deploy from source using the same commands (`npm install && npm run build`, start command `npm start`, port `3000`).
2. Add the environment variables in Cloud Run → **Variables & Secrets**.

---

## 4. Installing on Phones (PWA)

Both apps install separately with their own name, home screen icon, and standalone full-screen window:

### Player App (`NEXUS FF ARENA`)
- Open your public `https://.../` link on mobile.
- **Android (Chrome)**: Tap the **Install App** button on the Welcome screen or inside **Profile → Settings**, then tap **Install**.
- **iPhone / iPad (Safari)**: Tap **Install App** on the Welcome screen or **Profile → Settings** (or tap Safari's **Share** button → **Add to Home Screen**).
- Once installed, the Install App button automatically hides inside the installed app.

### Admin App (`NEXUS FF ADMIN`)
- Open `https://your-domain.com/admin` on mobile and sign in with your **Owner** account.
- After the owner logs in, an **Install App** button appears in the admin header/menu (not shown before login or on player accounts).
- On Android Chrome, tap **Install App** to add **NEXUS FF ADMIN** as a separate app with its own Admin badge icon. On iPhone Safari, use **Share → Add to Home Screen** while on `/admin`.

---

## 5. Turn Your HTTPS Link Into an Android APK / AAB (PWABuilder — No Coding)

Once your app is live on a public `https://` link:

1. Go to **[https://www.pwabuilder.com](https://www.pwabuilder.com)** in your browser.
2. Paste your deployed Player App URL (for example `https://your-domain.com/`) and click **Start**.
3. Confirm PWABuilder detects your Web Manifest (`NEXUS FF ARENA`), 192×192 & 512×512 & maskable icons, and Service Worker.
4. Click **Package for Stores → Android → Generate Package**.
5. Fill in the Android package details:
   - **Package ID**: Lowercase reverse-domain name, for example `com.nexusff.arena` (never change this after publishing!).
   - **App Name**: `NEXUS FF ARENA`
   - **Host / Start URL**: Your deployed HTTPS domain and `/`
   - **Display Mode**: `standalone`
   - **Orientation**: `portrait`
6. Download the generated zip file. Inside it you will find:
   - An **`.aab`** file (for Google Play Store upload) and an **`.apk`** file (for direct Android testing/install).
   - Your **Android signing keystore** (`signing.keystore`) and passwords (`signing-key-info.txt`).

### Signing Key & Removing the Browser Bar (Important!)
- **Back up your `.keystore` file and passwords safely!** Google Play requires the exact same signing key for every future app update. If lost, you cannot update the existing Play Store listing.
- To hide the Chrome address bar inside the APK (Trusted Web Activity / TWA), copy the SHA-256 fingerprint provided by PWABuilder (`assetlinks.json`) and place it at `public/.well-known/assetlinks.json`, then redeploy your site.

### Google Play Store Checklist (When Ready to Publish)
- Google Play Console Developer account ($25 one-time fee).
- Upload the **`.aab`** (Android App Bundle), not the `.apk`.
- Store assets: 512×512 app icon (use `public/pwa-512x512.png`), 1024×500 feature graphic, phone screenshots, and a public Privacy Policy URL.
- Complete Google Play **Content Rating** and **Data Safety** forms accurately (mentioning authentication, tournament data, and optional user uploads).
- Optional: You can repeat the same PWABuilder steps using `/admin` and a separate package ID (for example `com.nexusff.admin`) if you also want a private Admin APK for yourself.
