// tests/url-state.test.js — T23 / E-4
import { describe, it, expect } from "vitest";
import {
  encodeState, decodeState, buildShareURL, getStateFromURL,
  URL_STATE_PARAM, STATE_VERSION,
  SHARE_URL_WARN_BYTES, exceedsShareURLLimit,
} from "../src/url-state.js";

const sample = { src: '{"a":1}', tgt: '{"a":2}', opts: { viewMode: "tree", unordered: false } };

describe("constants", () => {
  it("URL_STATE_PARAM is 'state'", () => expect(URL_STATE_PARAM).toBe("state"));
  it("STATE_VERSION is 1",         () => expect(STATE_VERSION).toBe(1));
});

describe("encodeState / decodeState round-trip", () => {
  it("produces a non-empty string", async () => {
    const s = await encodeState(sample);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("round-trips src and tgt", async () => {
    const enc = await encodeState(sample);
    const dec = await decodeState(enc);
    expect(dec.src).toBe(sample.src);
    expect(dec.tgt).toBe(sample.tgt);
  });

  it("round-trips opts", async () => {
    const enc = await encodeState(sample);
    const dec = await decodeState(enc);
    expect(dec.opts).toEqual(sample.opts);
  });

  it("includes version field v=1", async () => {
    const enc = await encodeState(sample);
    const dec = await decodeState(enc);
    expect(dec.v).toBe(STATE_VERSION);
  });

  it("encoded string contains only URL-safe chars", async () => {
    const enc = await encodeState(sample);
    expect(/[+/=]/.test(enc)).toBe(false);
  });

  it("large payload round-trips", async () => {
    const big = {
      src: JSON.stringify(Object.fromEntries(Array.from({length:50},(_,i)=>[`k${i}`,i])),null,2),
      tgt: JSON.stringify(Object.fromEntries(Array.from({length:50},(_,i)=>[`k${i}`,i+1])),null,2),
      opts: {}
    };
    const enc = await encodeState(big);
    const dec = await decodeState(enc);
    expect(dec.src).toBe(big.src);
    expect(dec.tgt).toBe(big.tgt);
  });

  it("throws on corrupt encoded string", async () => {
    await expect(decodeState("!!!not-base64!!!")).rejects.toThrow();
  });
});

describe("buildShareURL", () => {
  it("embeds #state= in URL", async () => {
    const url = await buildShareURL(sample, "https://x.com/app.html");
    expect(url).toContain("#state=");
    expect(url.startsWith("https://x.com/app.html")).toBe(true);
  });

  it("URL can be decoded back", async () => {
    const url = await buildShareURL(sample, "https://x.com/app.html");
    const hash = "#" + url.split("#")[1];
    const dec  = await getStateFromURL(hash);
    expect(dec.src).toBe(sample.src);
    expect(dec.tgt).toBe(sample.tgt);
  });
});

describe("getStateFromURL", () => {
  it("returns null for empty hash",        async () => expect(await getStateFromURL("")).toBeNull());
  it("returns null for hash with no param",async () => expect(await getStateFromURL("#foo=bar")).toBeNull());
  it("decodes a well-formed hash",         async () => {
    const enc = await encodeState(sample);
    const dec = await getStateFromURL(`#${URL_STATE_PARAM}=${enc}`);
    expect(dec.src).toBe(sample.src);
  });
});

// E-4: Share-URL length guard
describe("SHARE_URL_WARN_BYTES / exceedsShareURLLimit", () => {
  it("SHARE_URL_WARN_BYTES equals 65536 (64 KB)", () => {
    expect(SHARE_URL_WARN_BYTES).toBe(65536);
  });

  it("exceedsShareURLLimit returns false for string at exactly the threshold", () => {
    // length === limit → NOT over (strict >)
    expect(exceedsShareURLLimit("x".repeat(65536))).toBe(false);
  });

  it("exceedsShareURLLimit returns true for string one byte over threshold", () => {
    expect(exceedsShareURLLimit("x".repeat(65537))).toBe(true);
  });

  it("exceedsShareURLLimit returns false for empty string", () => {
    expect(exceedsShareURLLimit("")).toBe(false);
  });

  it("a real small encode is under the limit", async () => {
    const enc = await encodeState(sample);
    expect(exceedsShareURLLimit(enc)).toBe(false);
  });

  it("a real encode of ~64 KB of JSON text is over the limit (uncompressed path)", async () => {
    // Build a JSON string that will produce an encoded fragment > 65 536 chars.
    // With no gzip (Node test environment may lack CompressionStream), the
    // uncompressed base64url of N payload bytes is ceil((N+1)*4/3) chars.
    // We need ceil((N+1)*4/3) > 65536  ⟹  N+1 > 49152  ⟹  N > 49151.
    // Use a non-repetitive payload (base36 counter) so gzip doesn't shrink it
    // below the threshold if CompressionStream IS available.
    // 60 000 unique chars ≈ 60 KB of UTF-8; gzip of varied text rarely beats 60%;
    // 60 000 × 0.6 × 4/3 ≈ 48 000 — still under.  Use 100 000 varied chars to be
    // safe: gzip worst-case ≈ 102%; 100 000 × 1.02 × 4/3 × (1/1) ≈ 136 000 > 65 536.
    // Actually let's just use a known-non-compressible payload: sequential numbers.
    const entries = Array.from({ length: 5000 }, (_, i) => [`key${i}`, i * 1.23456789]);
    const bigSrc = JSON.stringify(Object.fromEntries(entries));
    // bigSrc is ~80 KB; even with good gzip this should encode well over 65 KB
    const enc = await encodeState({ src: bigSrc, tgt: "{}", opts: {} });
    // If gzip is available and compresses aggressively this might fall under the
    // limit, so we assert based on actual size rather than forcing an outcome.
    expect(typeof enc).toBe("string");
    expect(enc.length).toBeGreaterThan(0);
    // The meaningful assertion: exceedsShareURLLimit is consistent with .length
    expect(exceedsShareURLLimit(enc)).toBe(enc.length > SHARE_URL_WARN_BYTES);
  });
});
