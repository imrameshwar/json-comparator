// src/url-state.js — T23
//
// Encode / decode comparison state into a URL fragment so a comparison can be
// shared by copying the URL.  All data stays in the URL — nothing is sent to
// any server.  A privacy warning is shown before the URL is generated.
//
// Encoding:
//   The state object is JSON-serialised, UTF-8 encoded, then base64url-encoded
//   (using the URL-safe alphabet A-Za-z0-9-_) and stored as the URL fragment:
//     #state=<base64url>
//
//   We use CompressionStream (gzip) when available to keep URLs shorter.
//   The first byte of the payload is a version nibble:
//     0x01 = raw JSON (no compression)
//     0x02 = gzip-compressed JSON
//
// State schema (version 1):
//   { v:1, src: string, tgt: string, opts: object }
//   opts mirrors getOpts() + viewMode + inputFormat.
//
// Privacy note:
//   The source and target JSON texts are embedded verbatim in the URL.
//   Anyone with the URL can read both documents.  The warning text is
//   shown in the UI before encoding — this module just provides the codec.

// ─── Constants ────────────────────────────────────────────────────────────────
export const URL_STATE_PARAM      = "state";
export const STATE_VERSION        = 1;
/** E-4: encoded fragment length above which we warn the user.
 *  Many chat apps and browsers silently truncate URLs longer than ~64 KB. */
export const SHARE_URL_WARN_BYTES = 64 * 1024; // 65 536

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toBase64url(bytes) {
  // bytes is Uint8Array
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── encodeState ─────────────────────────────────────────────────────────────
/**
 * Encode a state object into a base64url string suitable for use as a URL
 * fragment parameter.  Returns a Promise<string>.
 *
 * Uses gzip compression when CompressionStream is available (modern browsers),
 * otherwise falls back to plain JSON encoding.
 *
 * @param {{ src: string, tgt: string, opts: object }} state
 * @returns {Promise<string>}
 */
export async function encodeState(state) {
  const payload = JSON.stringify({ v: STATE_VERSION, ...state });
  const bytes   = new TextEncoder().encode(payload);

  // Try gzip compression
  if (typeof CompressionStream !== "undefined") {
    try {
      const cs     = new CompressionStream("gzip");
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      const reader = cs.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      // Prepend version byte 0x02 (compressed)
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out   = new Uint8Array(1 + total);
      out[0] = 0x02;
      let offset = 1;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      return toBase64url(out);
    } catch (_) { /* fall through to uncompressed */ }
  }

  // Fallback: raw JSON, version byte 0x01
  const out = new Uint8Array(1 + bytes.length);
  out[0] = 0x01;
  out.set(bytes, 1);
  return toBase64url(out);
}

// ─── decodeState ─────────────────────────────────────────────────────────────
/**
 * Decode a base64url string produced by encodeState back to a state object.
 * Returns a Promise<{ v, src, tgt, opts }> or throws if decoding fails.
 *
 * @param {string} encoded
 * @returns {Promise<object>}
 */
export async function decodeState(encoded) {
  const bytes  = fromBase64url(encoded);
  const ver    = bytes[0];
  const body   = bytes.slice(1);

  let json;
  if (ver === 0x02) {
    // gzip-compressed
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This URL was compressed with gzip; your browser does not support DecompressionStream.");
    }
    const ds     = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(body);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    json = new TextDecoder().decode(buf);
  } else if (ver === 0x01) {
    json = new TextDecoder().decode(body);
  } else {
    throw new Error(`Unknown state version: 0x${ver.toString(16)}`);
  }

  const state = JSON.parse(json);
  if (!state || typeof state !== "object") throw new Error("Invalid state payload");
  return state;
}

// ─── getStateFromURL ─────────────────────────────────────────────────────────
/**
 * Read and decode the `state` parameter from the current URL's hash fragment.
 * Returns the decoded state object or null if no state parameter is present.
 *
 * @param {string} [hash] - optional override for location.hash (for testing)
 * @returns {Promise<object|null>}
 */
export async function getStateFromURL(hash) {
  const fragment = (hash !== undefined ? hash : (typeof location !== "undefined" ? location.hash : "")).replace(/^#/, "");
  const params   = new URLSearchParams(fragment);
  const encoded  = params.get(URL_STATE_PARAM);
  if (!encoded) return null;
  return decodeState(encoded);
}

// ─── exceedsShareURLLimit ─────────────────────────────────────────────────────
/**
 * Returns true when the encoded fragment string is longer than the warn
 * threshold (SHARE_URL_WARN_BYTES).  The encoded string is pure ASCII
 * (base64url alphabet), so its .length equals its byte count in a URL.
 *
 * @param {string} encoded - value returned by encodeState()
 * @returns {boolean}
 */
export function exceedsShareURLLimit(encoded) {
  return encoded.length > SHARE_URL_WARN_BYTES;
}

// ─── buildShareURL ────────────────────────────────────────────────────────────
/**
 * Build a shareable URL for the given state.  The state is encoded into the
 * hash fragment so the server never sees the content.
 *
 * @param {{ src: string, tgt: string, opts: object }} state
 * @param {string} [base] - base URL (defaults to location.href stripped of hash)
 * @returns {Promise<string>}
 */
export async function buildShareURL(state, base) {
  const encoded = await encodeState(state);
  const baseURL = base !== undefined
    ? base
    : (typeof location !== "undefined"
       ? location.href.replace(/#.*$/, "")
       : "");
  return `${baseURL}#${URL_STATE_PARAM}=${encoded}`;
}
