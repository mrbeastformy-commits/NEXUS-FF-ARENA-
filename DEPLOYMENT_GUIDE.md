# NEXUS FF ARENA & NEXUS FF ADMIN — Deployment Guide

## 1. Architecture Overview
- **Player App (`NEXUS FF ARENA`)**: Entry `index.html` (`/`)
- **Admin App (`NEXUS FF ADMIN`)**: Entry `admin.html` (`/admin`)
- **Shared Firebase Backend**: Authentication, Firestore (`ai-studio-c4e130ea-a68b-41c0-821c-a7b9cb1df221`), Cloud Messaging, and Cloud Functions (`functions/src/index.ts`).
- **Media Assets**: Compressed images (`< 300 KB`) are stored directly in Firestore (`images/{imageId}`) and background music is bundled locally under `public/audio/arena-theme.m4a`.

## 2. Firebase Console Setup Checklist
1. **Authentication Providers**:
   - In Firebase Console → Authentication → Sign-in method, enable **Email/Password** and **Google**.
   - Under Settings → Authorized domains, add your production domain(s) for both Player and Admin apps.
2. **Firestore Security Rules**:
   - Deploy `firestore.rules` via `firebase deploy --only firestore:rules`.
4. **Cloud Functions & Owner Allowlist Secret**:
   - Set the server-only owner allowlist secret (never committed to client code):
     ```bash
     firebase functions:secrets:set OWNER_ADMIN_ALLOWLIST
     # Enter comma-separated verified owner Gmail(s)
     ```
   - Install & deploy functions:
     ```bash
     cd functions && npm install && cd ..
     firebase deploy --only functions
     ```
5. **App Check & FCM Web Push**:
   - Enable reCAPTCHA v3 in Firebase Console → App Check and set `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
   - Generate a Web Push certificate in Project Settings → Cloud Messaging and set `VITE_FIREBASE_VAPID_KEY`.

## 3. Separate Hosting Deployment (Player App & Admin App)
```bash
npm run build
firebase target:apply hosting player-arena <your-player-site-id>
firebase target:apply hosting admin-console <your-admin-site-id>
firebase deploy --only hosting
```

## 4. Security & Compliance Reminders
- **Payment Feature Flags**: Keep `depositsEnabled`, `withdrawalsEnabled`, and `paidEntriesEnabled` disabled in **Admin → Security Settings** until your payment provider compliance and local legal requirements are verified.
- **Background Music Rights**: Confirm music licensing/usage rights for the uploaded audio track in **Admin → Security Settings → Background Music** prior to public launch.
