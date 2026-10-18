import { describe, expect, it } from "vitest";
import { base64Decode, base64Encode, sha256 } from "@/engine/util/hash";

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
});

describe("base64", () => {
  it("encodes known vectors", () => {
    expect(base64Encode("Man")).toBe("TWFu");
    expect(base64Encode("hello")).toBe("aGVsbG8=");
    expect(base64Encode("foobar")).toBe("Zm9vYmFy");
  });
  it("round-trips unicode", () => {
    const s = "Zażółć gęślą jaźń — BLACKNET{✓}";
    expect(base64Decode(base64Encode(s))).toBe(s);
  });
  it("decodes the seeded leak", () => {
    const decoded = base64Decode(
      "UHJ6ZWNpZWs6IHNrb250YWt0dWogc2llIHogYm9hcmQuaG9sbG93ICgxMC42Ni42LjYpLiBGbGFnYTogQkxBQ0tORVR7aG9sbG93X2JvYXJkX2luZm9ybWFudH0=",
    );
    expect(decoded).toContain("board.hollow");
    expect(decoded).toContain("BLACKNET{hollow_board_informant}");
  });
});
