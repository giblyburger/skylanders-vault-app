# Skylanders Vault

A complete, offline-first Skylanders collection app covering every main series from Spyro's Adventure through Imaginators.

## What is included

- 640 obtainable pieces with one consistently framed original card artwork per item.
- Figures, variants, Traps, vehicles, Creation Crystals, Portals, Magic Items, Adventure pieces, and accessories.
- Separate reference treatment for unreleased, technical-only, digital, pack, and villain records.
- Search, collection quantities, condition, packaging, storage, notes, purchase details, personal photos, compatibility, and exact documented scan IDs.
- Local-first use with optional private cloud sync across paired devices.
- Standard, iPad, and TV/AirPlay display layouts.

## iPad app

The native iOS project lives in `ios/App` and uses Capacitor 6 so it can run on iOS 13 or newer, including an iPad Mini 4 on iOS 15.

The GitHub workflow builds an unsigned IPA for jailbroken devices. Tagged builds are attached to a GitHub Release as:

`Skylanders-Vault-unsigned.ipa`

The complete interface, catalog, and card-art library are bundled into the IPA. Internet access is only needed for cloud sync, pairing, personal-photo backup, and future updates.

## Local development

```bash
pnpm install
pnpm run build
pnpm run audit
```

Serve `dist/client` with any static web server for the browser edition.

To refresh the native iOS web bundle on macOS:

```bash
pnpm run ios:sync
```

## Publishing

- `.github/workflows/pages.yml` builds and publishes the browser edition to GitHub Pages.
- `.github/workflows/build-ios-ipa.yml` builds the unsigned IPA on a macOS runner.
- A tag named `ios-v*` publishes the IPA as a permanent GitHub Release download.
- `.openai/hosting.json` configures the private cloud-backed Sites deployment.
