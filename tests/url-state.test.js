// tests/url-state.test.js — T23
import { describe, it, expect } from "vitest";
import {
  encodeState, decodeState, buildShareURL, getStateFromURL,
  URL_STATE_PARAM, STATE_VERSION,
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
