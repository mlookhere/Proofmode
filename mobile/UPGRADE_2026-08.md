# ProofMode Mobile dependency baseline — 2026-08

Production baseline for Expo SDK 57. The goal is newest **stable compatible** versions, not unrelated package maxima.

## Compatibility-critical pins

- Expo `~57.0.15`
- React `19.2.3`
- React DOM `19.2.3`
- React Native `0.86.2`
- React Native Reanimated `4.5.1`
- React Native Worklets `0.10.1`
- React Native Safe Area Context `~5.7.0`
- React Native Screens `~4.26.0`
- Expo Router `~57.0.15`
- Expo Constants `~57.0.13`
- Expo Linking `~57.0.7`
- TypeScript `~6.0.3`

React Native 0.87 is newer but is not the stable React Native target for Expo SDK 57. Do not mix it into the stable app until Expo publishes a stable SDK targeting it.

## Clean validation

```powershell
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item package-lock.json -Force -ErrorAction SilentlyContinue
npm cache verify
npm install
npx expo-doctor@latest
npm run typecheck
npm run start:clear
```

Do not use `npm audit fix --force`, `npm install --force`, or `--legacy-peer-deps` to silence compatibility errors.
