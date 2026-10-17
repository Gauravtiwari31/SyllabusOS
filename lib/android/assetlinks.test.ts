import { describe, expect, it } from "vitest";
import { ANDROID_APP, buildAssetLinks, normalizeFingerprint } from "./assetlinks";

const PLAY =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

describe("normalizeFingerprint", () => {
  it("accepts colon and bare-hex forms in any case", () => {
    expect(normalizeFingerprint(PLAY.toLowerCase())).toBe(PLAY);
    expect(normalizeFingerprint(` ${PLAY.replace(/:/g, "")} `)).toBe(PLAY);
  });

  it("rejects anything that is not 32 bytes of hex", () => {
    expect(normalizeFingerprint("")).toBeNull();
    expect(normalizeFingerprint("AA:BB")).toBeNull();
    expect(normalizeFingerprint(PLAY.replace("AA", "ZZ"))).toBeNull();
  });
});

describe("buildAssetLinks", () => {
  it("publishes the built-in app with no configuration", () => {
    const links = buildAssetLinks();
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(links[0].target.package_name).toBe(ANDROID_APP.packageName);
    expect(links[0].target.sha256_cert_fingerprints).toEqual([...ANDROID_APP.fingerprints]);
    for (const f of links[0].target.sha256_cert_fingerprints) expect(normalizeFingerprint(f)).toBe(f);
  });

  it("merges extra fingerprints for the same package without duplicates", () => {
    const links = buildAssetLinks(ANDROID_APP.packageName, `${PLAY}, ${ANDROID_APP.fingerprints[0]}`);
    expect(links).toHaveLength(1);
    expect(links[0].target.sha256_cert_fingerprints).toEqual([...ANDROID_APP.fingerprints, PLAY]);
  });

  it("adds a statement for another package", () => {
    const links = buildAssetLinks("com.example.fork", PLAY);
    expect(links.map((l) => l.target.package_name)).toEqual([ANDROID_APP.packageName, "com.example.fork"]);
    expect(links[1].target.sha256_cert_fingerprints).toEqual([PLAY]);
  });

  it("ignores an invalid package or fingerprints", () => {
    expect(buildAssetLinks("not a package", PLAY)).toHaveLength(1);
    expect(buildAssetLinks("com.example.fork", "nope")).toHaveLength(1);
  });
});
