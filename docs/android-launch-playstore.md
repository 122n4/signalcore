# Syntrake Android Launch Guide (Google Play)

Last updated: 2026-02-28

## Goal

Publish Syntrake as an Android app in Google Play while keeping a single web codebase.

Recommended stack:

- PWA (already enabled in this repo)
- Trusted Web Activity (TWA) wrapper
- Bubblewrap CLI for Android project generation

## Prerequisites

- Domain live on HTTPS: `https://syntrake.com`
- Android Studio installed
- Java 17+
- Node.js 20+
- Google Play Console account

## 1) Verify PWA readiness

Check:

- `https://syntrake.com/manifest.webmanifest`
- `https://syntrake.com/sw.js`
- Install prompt appears in Chrome Android

## 2) Create TWA project with Bubblewrap

Install Bubblewrap globally:

```bash
npm i -g @bubblewrap/cli
```

Generate Android project:

```bash
bubblewrap init --manifest https://syntrake.com/manifest.webmanifest
```

During setup, use:

- Application ID: `com.syntrake.app`
- Host: `syntrake.com`
- Launcher name: `Syntrake`

Build:

```bash
bubblewrap build
```

This creates an Android project with AAB/APK output.

## 3) Configure Digital Asset Links

For TWA trust, publish:

- `https://syntrake.com/.well-known/assetlinks.json`

Content must include your Play signing certificate fingerprint and package id.

Use Bubblewrap helper after keystore setup:

```bash
bubblewrap fingerprint
```

Then update `assetlinks.json` with:

- `package_name`: `com.syntrake.app`
- `sha256_cert_fingerprints`: your signing fingerprint

## 4) Upload to Google Play

In Play Console:

- Create app -> `Syntrake`
- Upload `.aab`
- Complete store listing:
  - App name
  - Short + full description
  - Screenshots (phone)
  - Privacy policy URL (`https://syntrake.com/privacy`)
- Choose category (Finance)
- Submit internal test first

## 5) Release flow (recommended)

1. Internal testing
2. Closed testing (small beta group)
3. Production rollout at 10%
4. Full rollout after crash-free validation

## 6) Ongoing maintenance

- Keep web app uptime high (TWA depends on site availability)
- Version PWA icons/manifest when branding changes
- Monitor:
  - Crash reports in Play Console
  - Web performance for Android users
  - Conversion from install to paid user
