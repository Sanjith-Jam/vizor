#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../mobile-app"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
npm ci
npx expo prebuild --platform android --no-install
./android/gradlew -p android assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
mkdir -p ../output/android
release_version=$(node -p "require('./app.json').expo.version")
cp android/app/build/outputs/apk/release/app-release.apk "../output/android/vizor-${release_version}-arm64.apk"
