set dotenv-load := true
set positional-arguments

default:
    @just --list

seed *args:
    bash ./scripts/seed-nextcloud.sh "$@"

unseed *args:
    bash ./scripts/seed-nextcloud.sh --wipe "$@"

android:
    yarn android

ios:
    yarn ios

e2e-build:
    EXPO_NO_GIT_STATUS=1 npx expo prebuild -p android --clean --no-install \
      && (cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease -PreactNativeArchitectures=x86_64); \
    rc=$?; git checkout -- android/app/src/main/AndroidManifest.xml; exit $rc

e2e *args:
    yarn jest -c e2e/jest.config.mjs "$@"
