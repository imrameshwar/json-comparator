// tests/lenient-parsers.test.js — T22
import { describe, it, expect } from "vitest";
import { parseJSONC, parseJSON5, parseNDJSON } from "../src/lenient-parsers.js";

// ─── JSONC ────────────────────────────────────────────────────────────────────
describe("parseJSONC", () => {
  it("passes plain JSON unchanged",   () => expect(parseJSONC('{"a":1}')).toEqual({a:1}));
  it("strips // comment",             () => expect(parseJSONC('{"a":1 // comment\n}')).toEqual({a:1}));
  it("strips /* */ comment",          () => expect(parseJSONC('{"a": /* x */ 2}')).toEqual({a:2}));
  it("comment inside string kept",    () => expect(parseJSONC('{"a":"http://x.com"}')).toEqual({a:"http://x.com"}));
  it("block comment in array",        () => expect(parseJSONC('[/*a*/1,/*b*/2]')).toEqual([1,2]));
  it("multiple comments",             () => expect(parseJSONC('{"a":1,"b"/*x*/:2}')).toEqual({a:1,b:2}));
  it("throws SyntaxError on bad JSON",() => expect(()=>parseJSONC('{bad}')).toThrow(SyntaxError));
  it("preserves escaped quotes inside strings", () => {
    expect(parseJSONC('{"a":"say \\"hi\\""}')).toEqual({a:'say "hi"'});
  });
});

// ─── JSON5 ────────────────────────────────────────────────────────────────────
describe("parseJSON5", () => {
  it("unquoted identifier key",        () => expect(parseJSON5('{name:"a"}')).toEqual({name:"a"}));
  it("single-quoted string",           () => expect(parseJSON5("{'k':'v'}")).toEqual({k:"v"}));
  it("trailing comma object",          () => expect(parseJSON5('{a:1,}')).toEqual({a:1}));
  it("trailing comma array",           () => expect(parseJSON5('[1,2,3,]')).toEqual([1,2,3]));
  it("line comment",                   () => expect(parseJSON5('{a:1//x\n}')).toEqual({a:1}));
  it("block comment",                  () => expect(parseJSON5('{a:/*x*/1}')).toEqual({a:1}));
  it("hex literal",                    () => expect(parseJSON5('[0xFF]')).toEqual([255]));
  it("leading-dot float",              () => expect(parseJSON5('[.5]')).toEqual([0.5]));
  it("Infinity keyword",               () => expect(parseJSON5('{a:Infinity}')).toEqual({a:Infinity}));
  it("NaN keyword",                    () => expect(Number.isNaN(parseJSON5('{a:NaN}').a)).toBe(true));
  it("nested with trailing commas",    () => expect(parseJSON5("{a:{b:[1,],},}")).toEqual({a:{b:[1]}}));
  it("double-quoted string same as JSON", () => expect(parseJSON5('{"a":"b"}')).toEqual({a:"b"}));
  it("\\u escape in double-quoted",    () => expect(parseJSON5('{"a":"\\u0041"}')).toEqual({a:"A"}));
  it("escaped single-quote inside single-quoted", () => {
    expect(parseJSON5("{a:'it\\'s'}")).toEqual({a:"it's"});
  });
  it("throws on invalid input",        () => expect(()=>parseJSON5('{a:}')).toThrow(SyntaxError));
  it("handles empty object",           () => expect(parseJSON5('{}')).toEqual({}));
  it("handles empty array",            () => expect(parseJSON5('[]')).toEqual([]));
  it("handles plain JSON",             () => expect(parseJSON5('{"a":1,"b":[2,3]}')).toEqual({a:1,b:[2,3]}));
});

// ─── NDJSON ───────────────────────────────────────────────────────────────────
describe("parseNDJSON", () => {
  it("two records → array",            () => expect(parseNDJSON('{"a":1}\n{"b":2}')).toEqual([{a:1},{b:2}]));
  it("blank lines skipped",            () => expect(parseNDJSON('{"a":1}\n\n{"b":2}\n')).toEqual([{a:1},{b:2}]));
  it("single-object → returned as-is (not wrapped)", () => expect(parseNDJSON('{"a":1}')).toEqual({a:1}));
  it("single-array → returned as-is",  () => expect(parseNDJSON('[1,2]')).toEqual([1,2]));
  it("three records",                  () => expect(parseNDJSON('1\n2\n3')).toEqual([1,2,3]));
  it("error includes line number",     () => {
    expect(()=>parseNDJSON('{"a":1}\n{bad}')).toThrow(/line 2/);
  });
  it("empty / blank input throws",     () => expect(()=>parseNDJSON('')).toThrow(SyntaxError));
  it("whitespace-only throws",         () => expect(()=>parseNDJSON('  \n  ')).toThrow(SyntaxError));
});
