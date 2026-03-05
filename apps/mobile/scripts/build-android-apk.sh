#!/usr/bin/env bash
set -euo pipefail

if command -v eas >/dev/null 2>&1; then
  echo "Using EAS cloud build for distributable APK..."
  eas build -p android --profile preview
  exit 0
fi

echo "EAS CLI not found. Attempting local Android build with Gradle..."
if [ ! -d "android" ]; then
  npx expo prebuild -p android
fi

cd android
./gradlew assembleRelease

echo "APK build complete. Find APK under android/app/build/outputs/apk/release/"
