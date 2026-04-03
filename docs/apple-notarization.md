# Apple Notarization Setup

Until this is done, every macOS user who downloads the app will see **"Workroot is damaged and can't be opened"** and must manually run `sudo xattr -cr /Applications/Workroot.app`.

---

## What You Need

1. **Apple Developer account** — $99/year at https://developer.apple.com
2. **Developer ID Application certificate** — generated in Xcode or the Apple Developer portal
3. **App-specific password** — generated at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords

---

## Steps

### 1. Get your credentials

From your Apple Developer account, collect:

| Item | Where to find it |
|------|-----------------|
| `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID (10-char string) |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | appleid.apple.com → App-Specific Passwords → Generate |
| `APPLE_SIGNING_IDENTITY` | Run: `security find-identity -v -p codesigning` → look for `Developer ID Application: ...` |
| `APPLE_CERTIFICATE` | Export the Developer ID cert from Keychain as `.p12`, then base64-encode it: `base64 -i cert.p12 | pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |

### 2. Add secrets to GitHub

Go to: **github.com/sauravpanda/workroot → Settings → Secrets and variables → Actions**

Add all six secrets from the table above.

### 3. Update the release workflow

In `.github/workflows/release.yml`, inside the `Build and upload` step, add these env vars:

```yaml
- name: Build and upload
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  with:
    releaseId: ${{ needs.create-release.outputs.release_id }}
    args: ${{ matrix.args }}
    updaterJsonPreferNsis: true
```

`tauri-apps/tauri-action` handles signing and notarization automatically when these env vars are present.

### 4. Tag a new release

```bash
git tag v0.1.2
git push origin v0.1.2
```

The CI will build, sign, notarize, and staple the app. Users who download after this will not see the Gatekeeper error.

---

## Workaround (until notarization is set up)

Tell users to run after installing:

```bash
sudo xattr -cr /Applications/Workroot.app
```
