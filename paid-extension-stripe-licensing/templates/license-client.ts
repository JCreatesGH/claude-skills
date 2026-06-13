/**
 * Licensing: free tier (30 pages, watermarked) vs. $10 full license.
 *
 * License keys are ECDSA P-256 signatures verified OFFLINE against the
 * public key bundled below — the extension never embeds any Stripe secret
 * and never needs the network to validate a key. Keys are minted by the
 * owner (scripts/license-tools.mjs) or by the Stripe fulfillment worker
 * (server/stripe-worker) after a successful payment.
 *
 * One-device enforcement is best-effort: when ACTIVATION_BASE_URL points at
 * the deployed worker, activation registers the device and a second device
 * is refused; without it (or when the network is down) a validly signed key
 * still activates offline so paying customers are never locked out.
 */
import { LICENSE_PUBLIC_KEY_JWK } from './licensePublicKey';

export const FREE_PAGE_LIMIT = 30;
export const FULL_PAGE_LIMIT = 1000;
export const LICENSE_PRICE_TEXT = '$10';
/** Stripe Payment Link for the full license. Replace with your own link. */
export const PAYMENT_LINK_URL = 'https://buy.stripe.com/REPLACE_WITH_YOUR_PAYMENT_LINK';
/**
 * Base URL of the deployed fulfillment/activation worker
 * (see server/stripe-worker/README.md), e.g. 'https://rcpdf.yourname.workers.dev'.
 * Leave empty to skip server-side one-device activation.
 */
export const ACTIVATION_BASE_URL = '';

export type LicenseKind = 'std' | 'mst';

export interface LicensePayload {
  v: number;
  k: LicenseKind;
  id: string;
  ts: number;
  n?: string;
}

export interface StoredLicense {
  key: string;
  kind: LicenseKind;
  id: string;
  activatedAt: number;
  deviceId: string;
  serverActivated: boolean;
}

export interface LicenseStatus {
  licensed: boolean;
  kind: LicenseKind | null;
  maskedKey: string | null;
}

const LICENSE_STORAGE_KEY = 'rcpdf-license';
const DEVICE_ID_STORAGE_KEY = 'rcpdf-device-id';
const KEY_RE = /^RCPDF-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

let publicKeyPromise: Promise<CryptoKey> | null = null;
function importPublicKey(): Promise<CryptoKey> {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      'jwk',
      LICENSE_PUBLIC_KEY_JWK as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  }
  return publicKeyPromise;
}

/** Verify a key's signature and shape. Returns its payload, or null. */
export async function verifyLicenseKey(raw: string): Promise<LicensePayload | null> {
  // Emails hard-wrap long keys; the key alphabet has no whitespace, so
  // stripping ALL whitespace is lossless and rescues copy/paste mangling.
  const match = raw.replace(/\s+/g, '').match(KEY_RE);
  if (!match) return null;
  const [, payloadB64, sigB64] = match;
  try {
    const key = await importPublicKey();
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64urlToBytes(sigB64) as unknown as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as LicensePayload;
    if (payload.v !== 1 || (payload.k !== 'std' && payload.k !== 'mst') || !payload.id) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Stable per-install identifier used for one-device activation. */
export async function getDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(DEVICE_ID_STORAGE_KEY);
  const existing = stored[DEVICE_ID_STORAGE_KEY];
  if (typeof existing === 'string' && existing.length >= 16) return existing;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_STORAGE_KEY]: id });
  return id;
}

export async function getStoredLicense(): Promise<StoredLicense | null> {
  const stored = await chrome.storage.local.get(LICENSE_STORAGE_KEY);
  const license = stored[LICENSE_STORAGE_KEY] as StoredLicense | undefined;
  if (!license || typeof license.key !== 'string') return null;
  return license;
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const license = await getStoredLicense();
  if (!license) return { licensed: false, kind: null, maskedKey: null };
  // Re-verify the signature on every read: a hand-crafted storage entry must
  // not unlock the paid tier. The public-key import is memoized, so this is
  // one cheap ECDSA verify per session start / finalize.
  const payload = await verifyLicenseKey(license.key);
  if (!payload) {
    await chrome.storage.local.remove(LICENSE_STORAGE_KEY).catch(() => undefined);
    return { licensed: false, kind: null, maskedKey: null };
  }
  return {
    licensed: true,
    kind: payload.k,
    maskedKey: `${license.key.slice(0, 12)}…${license.key.slice(-6)}`,
  };
}

export interface ActivationResult {
  ok: boolean;
  error?: string;
  note?: string;
}

/** Validate a key, optionally register this device with the activation
 *  server, and store the license locally. */
export async function activateLicense(rawKey: string): Promise<ActivationResult> {
  const key = rawKey.replace(/\s+/g, '');
  const payload = await verifyLicenseKey(key);
  if (!payload) {
    return { ok: false, error: 'That license key is not valid. Check for missing characters.' };
  }
  const deviceId = await getDeviceId();
  let serverActivated = false;
  let note: string | undefined;
  if (ACTIVATION_BASE_URL && payload.k === 'std') {
    try {
      const response = await fetch(`${ACTIVATION_BASE_URL}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, deviceId }),
      });
      if (response.status === 409) {
        return {
          ok: false,
          error:
            'This license key is already activated on another device. ' +
            'Deactivate it there first (extension Options), or contact support.',
        };
      }
      if (response.ok) serverActivated = true;
      else note = 'Activated offline (the activation server returned an error).';
    } catch {
      // Never lock a paying customer out because of a network hiccup.
      note = 'Activated offline (the activation server was unreachable).';
    }
  }
  const license: StoredLicense = {
    key,
    kind: payload.k,
    id: payload.id,
    activatedAt: Date.now(),
    deviceId,
    serverActivated,
  };
  await chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: license });
  return { ok: true, note };
}

/** Remove the license from this device. The server release runs FIRST so a
 *  failed release can be reported — otherwise the user could be refused with
 *  "already activated" on their next machine with no warning. */
export async function deactivateLicense(): Promise<{ ok: true; warning?: string }> {
  const license = await getStoredLicense();
  let warning: string | undefined;
  if (license && ACTIVATION_BASE_URL && license.kind === 'std') {
    try {
      const response = await fetch(`${ACTIVATION_BASE_URL}/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: license.key, deviceId: license.deviceId }),
      });
      if (!response.ok) {
        warning =
          'The license server could not release this key; it may still count as active. ' +
          'Contact support if activation on another machine is refused.';
      }
    } catch {
      warning =
        'The license server was unreachable; the key may still count as active on this device. ' +
        'Contact support if activation on another machine is refused.';
    }
  }
  await chrome.storage.local.remove(LICENSE_STORAGE_KEY);
  return { ok: true, warning };
}
