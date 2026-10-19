import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, findUpdate, versionFromTag } from "./updateCheck";

test("versionFromTag only accepts app release tags", () => {
  assert.equal(versionFromTag("app-v1.2.0"), "1.2.0");
  assert.equal(versionFromTag("app-v2"), "2");
  assert.equal(versionFromTag("v1.2.0"), null);
  assert.equal(versionFromTag("app-vbeta"), null);
});

test("compareVersions is numeric, not lexical", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
});

const releases = [
  { tag_name: "app-v1.2.0", draft: true, html_url: "d", assets: [] },
  {
    tag_name: "app-v1.1.0",
    html_url: "https://github.com/x/y/releases/tag/app-v1.1.0",
    body: " New UI ",
    assets: [{ name: "ar-helmet-nav-app-v1.1.0.apk", browser_download_url: "https://dl/apk" }],
  },
  { tag_name: "app-v1.0.0", html_url: "old", assets: [] },
  { tag_name: "firmware-v9.0.0", html_url: "fw", assets: [] },
];

test("findUpdate picks the newest published app release with its APK", () => {
  assert.deepEqual(findUpdate(releases, "1.0.0"), {
    version: "1.1.0",
    downloadUrl: "https://dl/apk",
    pageUrl: "https://github.com/x/y/releases/tag/app-v1.1.0",
    notes: "New UI",
  });
});

test("findUpdate returns null when already up to date or on bad input", () => {
  assert.equal(findUpdate(releases, "1.1.0"), null);
  assert.equal(findUpdate(releases, "1.3.0"), null);
  assert.equal(findUpdate({ message: "rate limited" }, "1.0.0"), null);
});

test("findUpdate falls back to the release page when no APK is attached", () => {
  const u = findUpdate([{ tag_name: "app-v3.0.0", html_url: "page", assets: [] }], "1.0.0");
  assert.equal(u?.downloadUrl, "page");
});
