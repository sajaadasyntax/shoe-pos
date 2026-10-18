# Offline device activation

SolePOS uses an offline challenge-response code. The phone creates a device ID and a fresh random challenge; the operator utility uses a shared HMAC-SHA256 secret to generate a device-bound, expiring code. No network connection is needed to activate.

## Security trade-off

This is a convenience gate, not strong licensing or tamper protection. The same shared secret must be embedded in the app so the phone can validate codes offline. Anyone who obtains the APK can recover that secret and issue codes. The device ID is stored in Android secure storage, not backed by hardware attestation. Choose this approach only if that limitation is acceptable.

## Set up the operator secret

1. On the operator computer, from the `shoe-pos` directory, run `node scripts/activation.cjs setup`.
2. The command generates a random 32-byte secret and stores it in the git-ignored `.env.local`. Do not replace or lose it: replacing it invalidates existing codes.
3. Add the same `EXPO_PUBLIC_ACTIVATION_SECRET` value to the Expo EAS `preview` and `production` environments, then rebuild. The variable name uses Expo's public prefix because its value is compiled into the app; it is not secret from APK users.

## Activate a device

1. In the app, copy the displayed device challenge and send it to the operator.
2. On the operator computer, from the `shoe-pos` directory, run:

   ```sh
   node scripts/activation.cjs sign --device-id DEVICE_ID --challenge CHALLENGE --days 365
   ```

   Replace the values with the exact strings from the device challenge. `--days` is optional and defaults to 365; valid values are 1 to 3650. The utility reads the shared secret from `.env.local`.
3. Paste the printed JSON activation code into the app. It is bound to that device ID and challenge and expires at the included time.

If a challenge is regenerated, discard responses for the old challenge. Reinstalling the app or clearing its Android storage creates a new installation identity and requires reactivation. Devices with tokens issued by the previous signed-token implementation must be reactivated after installing this version.
