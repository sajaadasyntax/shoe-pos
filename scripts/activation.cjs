#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env.local');
const secretName = 'EXPO_PUBLIC_ACTIVATION_SECRET';

function usage() {
  console.log(`Offline SolePOS activation utility

Commands:
  node scripts/activation.cjs setup
  node scripts/activation.cjs sign --device-id ID --challenge VALUE [--days 365]

setup creates a random shared secret in .env.local.
sign prints the JSON activation code to paste into the app.
The shared secret is embedded in the app and can be recovered from its APK.`);
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${name ?? ''}`);
    values[name.slice(2)] = value;
  }
  return values;
}

function setup() {
  const envExists = fs.existsSync(envPath);
  const existing = envExists ? fs.readFileSync(envPath, 'utf8') : '';
  if (new RegExp(`^${secretName}=`, 'm').test(existing)) {
    throw new Error(`${secretName} already exists in .env.local. Refusing to replace it and invalidate existing activations.`);
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  if (envExists) fs.appendFileSync(envPath, `${separator}${secretName}=${secret}\n`);
  else fs.writeFileSync(envPath, `${secretName}=${secret}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Created ${secretName} in .env.local.`);
  console.log(`Add the same value to the Expo EAS preview and production environments as ${secretName}.`);
  console.log('Warning: this shared secret is embedded in the APK and can be recovered by its users.');
}

function readSecret() {
  let secret = process.env[secretName];
  if (!secret && fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${secretName}=([0-9a-fA-F]{64})\\s*$`, 'm'));
    secret = match?.[1];
  }
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error(`A 32-byte hexadecimal ${secretName} is required. Run setup first or set it in the environment.`);
  }
  return Buffer.from(secret, 'hex');
}

function sign() {
  const values = parseArgs(process.argv.slice(3));
  const deviceId = values['device-id'];
  const challenge = values.challenge;
  const days = Number(values.days ?? '365');
  if (!deviceId || !challenge) throw new Error('Both --device-id and --challenge are required.');
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw new Error('--days must be a whole number between 1 and 3650.');
  }
  const token = {
    version: 2,
    deviceId,
    challenge,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  };
  const canonical = `${token.version}\n${token.deviceId}\n${token.challenge}\n${token.expiresAt}`;
  const code = crypto.createHmac('sha256', readSecret()).update(canonical, 'utf8').digest('hex');
  console.log(JSON.stringify({ ...token, code }));
}

try {
  const command = process.argv[2];
  if (command === 'setup') setup();
  else if (command === 'sign') sign();
  else usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Activation command failed.');
  process.exitCode = 1;
}
