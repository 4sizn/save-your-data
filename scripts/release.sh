#!/bin/bash
# Archive, export and upload a TestFlight build with manual signing.
# Needs the "AltteulData AppStore" and "AltteulData Extension AppStore" profiles installed and an
# App Store Connect API key: ASC_KEY_ID, ASC_ISSUER_ID, key at ~/.appstoreconnect/private_keys/AuthKey_<id>.p8.
# Bump CURRENT_PROJECT_VERSION before each upload. Usage: bash scripts/release.sh [--upload]
set -euo pipefail
cd "$(dirname "$0")/.."
npm run -s build
pbx=AltteulData/AltteulData.xcodeproj/project.pbxproj
cp "$pbx" build/project.pbxproj.bak 2>/dev/null || { mkdir -p build; cp "$pbx" build/project.pbxproj.bak; }
trap 'cp build/project.pbxproj.bak "$pbx"' EXIT
# The project uses automatic signing for local builds; switch to the App Store profiles for this archive only.
python3 - "$pbx" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace('PRODUCT_BUNDLE_IDENTIFIER = com.lotus.altteuldata.Extension;',
              'PRODUCT_BUNDLE_IDENTIFIER = com.lotus.altteuldata.Extension;\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "AltteulData Extension AppStore";')
s = s.replace('PRODUCT_BUNDLE_IDENTIFIER = com.lotus.altteuldata;',
              'PRODUCT_BUNDLE_IDENTIFIER = com.lotus.altteuldata;\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "AltteulData AppStore";')
s = s.replace('CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";')
open(p, 'w').write(s)
PY
rm -rf build/AltteulData.xcarchive build/export
xcodebuild -project AltteulData/AltteulData.xcodeproj -scheme AltteulData -configuration Release \
  -destination generic/platform=iOS -archivePath build/AltteulData.xcarchive archive -quiet
cat > build/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>VN497S6KK3</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>com.lotus.altteuldata</key><string>AltteulData AppStore</string>
    <key>com.lotus.altteuldata.Extension</key><string>AltteulData Extension AppStore</string>
  </dict>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath build/AltteulData.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export -quiet
echo "IPA: build/export/AltteulData.ipa"
if [[ "${1:-}" == "--upload" ]]; then
  xcrun altool --upload-app -f build/export/AltteulData.ipa -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
fi
