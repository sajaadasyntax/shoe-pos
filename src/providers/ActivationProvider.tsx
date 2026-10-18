import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ActivationChallenge = { deviceId: string; challenge: string };
type ActivationState = {
  loading: boolean;
  activated: boolean;
  challenge: ActivationChallenge | null;
  error: string | null;
  refreshChallenge: () => Promise<void>;
  activate: (response: string) => Promise<void>;
};

type ActivationToken = {
  version: 2;
  deviceId: string;
  challenge: string;
  expiresAt: string;
  code: string;
};

const ACTIVATION_SECRET_ENV = 'EXPO_PUBLIC_ACTIVATION_SECRET';
const DEVICE_ID_KEY = 'solepos.activation-device-id';
const CHALLENGE_KEY = 'solepos.activation-challenge';
const TOKEN_KEY = 'solepos.activation-token';
const ActivationContext = createContext<ActivationState | null>(null);

function getActivationSecret(): Uint8Array {
  const value = process.env.EXPO_PUBLIC_ACTIVATION_SECRET;
  if (!value) {
    throw new Error(`The activation secret is not configured. Set ${ACTIVATION_SECRET_ENV} and rebuild the app.`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${ACTIVATION_SECRET_ENV} must be a 32-byte (64-character) hexadecimal value.`);
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function canonicalMessage(token: Pick<ActivationToken, 'version' | 'deviceId' | 'challenge' | 'expiresAt'>): Uint8Array {
  return new TextEncoder().encode(
    `${token.version}\n${token.deviceId}\n${token.challenge}\n${token.expiresAt}`,
  );
}

function hasValidShape(value: unknown): value is ActivationToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const token = value as Record<string, unknown>;
  return token.version === 2
    && typeof token.deviceId === 'string'
    && typeof token.challenge === 'string'
    && typeof token.expiresAt === 'string'
    && typeof token.code === 'string'
    && /^[0-9a-f]{64}$/i.test(token.code);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function verifyToken(token: ActivationToken, deviceId: string): boolean {
  if (token.version !== 2 || token.deviceId !== deviceId) return false;
  const expiry = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  const expectedCode = Array.from(hmac(sha256, getActivationSecret(), canonicalMessage(token)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqual(token.code.toLowerCase(), expectedCode);
}

export function ActivationProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [activated, setActivated] = useState(false);
  const [challenge, setChallenge] = useState<ActivationChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshChallenge = useCallback(async () => {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    const freshChallenge = Crypto.randomUUID();
    await SecureStore.setItemAsync(CHALLENGE_KEY, freshChallenge);
    setChallenge({ deviceId, challenge: freshChallenge });
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadActivation() {
      try {
        let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
        if (!deviceId) {
          deviceId = Crypto.randomUUID();
          await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
        }
        const [storedChallenge, storedTokenJson] = await Promise.all([
          SecureStore.getItemAsync(CHALLENGE_KEY),
          SecureStore.getItemAsync(TOKEN_KEY),
        ]);
        const storedTokenJsonValue: unknown = storedTokenJson ? JSON.parse(storedTokenJson) : null;
        const storedToken = hasValidShape(storedTokenJsonValue) ? storedTokenJsonValue : null;
        const isValid = storedToken ? verifyToken(storedToken, deviceId) : false;
        let currentChallenge = storedChallenge;
        if (!isValid && !currentChallenge) {
          currentChallenge = Crypto.randomUUID();
          await SecureStore.setItemAsync(CHALLENGE_KEY, currentChallenge);
        }
        if (!isValid && storedTokenJson) await SecureStore.deleteItemAsync(TOKEN_KEY);
        if (cancelled) return;
        setChallenge(currentChallenge ? { deviceId, challenge: currentChallenge } : null);
        setActivated(isValid);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not read activation data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadActivation();
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = useCallback(async (response: string) => {
    if (!challenge) throw new Error('Activation challenge is not ready.');
    getActivationSecret();

    let parsedToken: unknown;
    try {
      parsedToken = JSON.parse(response) as unknown;
    } catch {
      throw new Error('Activation response must be the JSON code generated by the offline activation tool.');
    }
    if (
      !hasValidShape(parsedToken)
      || parsedToken.version !== 2
      || parsedToken.deviceId !== challenge.deviceId
      || parsedToken.challenge !== challenge.challenge
      || !verifyToken(parsedToken, challenge.deviceId)
    ) {
      throw new Error('Activation response is invalid, expired, or belongs to another device challenge.');
    }
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(parsedToken));
    setActivated(true);
    setError(null);
  }, [challenge]);

  const value = useMemo(
    () => ({ loading, activated, challenge, error, refreshChallenge, activate }),
    [loading, activated, challenge, error, refreshChallenge, activate],
  );
  return <ActivationContext.Provider value={value}>{children}</ActivationContext.Provider>;
}

export function useActivation(): ActivationState {
  const value = useContext(ActivationContext);
  if (!value) throw new Error('useActivation must be rendered inside ActivationProvider.');
  return value;
}
