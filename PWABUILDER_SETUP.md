# PWABuilder Android setup

Website: https://seondprojet.vercel.app

The existing screen design, login, database, and features are unchanged. The existing Instagram-style icon is used, including a separate Android maskable icon. This is an independent clone, not the official Instagram app; app-store branding and approval remain your responsibility.

## What is ready

- Root-scoped manifest with stable id `/`, start URL `/`, standalone display, fullscreen preference, portrait orientation, matching black theme/background, and PNG icons.
- Production-only generated service worker with a fetch handler, network-first navigations, no OAuth/API caching, and no development/preview/iframe registration. Offline data/login are not guaranteed; this is not a full offline application.
- Public JSON endpoint for Android Digital Asset Links. **It is currently `[]`: the real package name and certificate are still required. It does not yet hide the Android URL bar.**

## Package it yourself

1. Visit https://www.pwabuilder.com/, enter `https://seondprojet.vercel.app`, and select **Start**. Re-run the report after updates. Missing manifest: check `/manifest.webmanifest`; missing icons: check the three PNG paths below; missing worker: refresh the published app and wait for worker activation. We have not asserted a score from PWABuilder's own report.
2. Select **Package for stores → Android → Generate package** (labels may vary). In the Android package options, set app name **Instagram** (or your own name), package ID such as **app.seondprojet.clone** (a suggestion, not yet registered), start URL `https://seondprojet.vercel.app/`, version name `1.0.0`, and version code `1`. Confirm the manifest icons and Android maskable icon. Keep the package ID stable for future updates and increment the version code.
3. In signing options, generate a new signing key or upload your existing keystore. Store the keystore, alias, and passwords privately with a secure backup; never commit them or paste passwords into chat. Updates must use the appropriate existing signing identity. With Play App Signing, keep the upload key and Google's app-signing certificate roles distinct.
4. Download the generated package. **APK** is for direct installation on an Android phone; **AAB** is for Play Store upload. This task does not generate either file.

## Remove the Android URL bar

Standalone/fullscreen manifest fields alone do **not** establish trust for a Trusted Web Activity. Android verifies your exact package ID and signing certificate against the website.

Extract the SHA-256 fingerprint locally (password is prompted, not supplied in the command):

```sh
keytool -list -v -keystore ./your-release-key.keystore -alias YOUR_ALIAS
```

If the downloaded APK is already signed, you can alternatively verify its actual signer with Android build tools:

```sh
apksigner verify --print-certs ./your-app.apk
```

Supply only the **package name and SHA-256 certificate fingerprint**—these are public identifiers, not your keystore/password. Replace `public/.well-known/assetlinks.json` with:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "YOUR.EXACT.PACKAGE.ID",
      "sha256_cert_fingerprints": ["YOUR:ACTUAL:SHA256:CERTIFICATE:FINGERPRINT"]
    }
  }
]
```

Those uppercase values are instructional placeholders; do not deploy them. Deploy the real values, check the endpoint below, then close/reopen or reinstall the APK and verify on an Android device. Do not change domain or start URL for an installed app casually; important manifest fields can be cached at install time.

For direct APK installs use that APK's signing certificate. For Play-installed builds use **Play Console → App integrity / App signing → App signing certificate → SHA-256**, not merely the upload certificate. Include both real certificates when supporting both distributions.

The website must serve the file as `application/json`, without a redirect or sign-in wall. In-scope app pages stay on the same origin. External links can legitimately show browser controls again; image/video/database requests to other origins are not themselves page navigation.

## Check published files

- https://seondprojet.vercel.app/manifest.webmanifest
- https://seondprojet.vercel.app/icon-192.png
- https://seondprojet.vercel.app/icon-512.png
- https://seondprojet.vercel.app/icon-maskable-512.png
- https://seondprojet.vercel.app/sw.js
- https://seondprojet.vercel.app/.well-known/assetlinks.json

Each must return HTTP 200; the final endpoint must return JSON. Its current empty list is a pending trust configuration, not a completed Android association. No APK/device URL-bar test is possible before the user's signed package exists.

Sources: https://docs.pwabuilder.com/ · https://github.com/pwa-builder/pwabuilder-google-play · https://developer.android.com/training/app-links/configure-assetlinks