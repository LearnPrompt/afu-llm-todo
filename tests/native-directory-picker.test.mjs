import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMacOSDirectoryPickerScript,
  formatPlannerDirectorySelection,
  resolvePlannerDirectoryPickerStart,
  selectNativeDirectory,
} from "../native-directory-picker.mjs";

test("directory picker script uses the current path and handles cancel", () => {
  const script = buildMacOSDirectoryPickerScript({
    currentPath: '/Users/demo/My "Folder"',
    prompt: "选择选题目录",
  });

  assert.match(script, /choose folder with prompt "选择选题目录"/);
  assert.match(script, /POSIX file "\/Users\/demo\/My \\"Folder\\"" as alias/);
  assert.match(script, /if errorNumber is -128 then return ""/);
  assert.match(script, /return POSIX path of selectedFolder/);
});

test("directory picker ignores a relative current path", () => {
  const script = buildMacOSDirectoryPickerScript({
    currentPath: "40_行动卡片",
  });

  assert.doesNotMatch(script, /POSIX file "40_行动卡片"/);
  assert.match(script, /set startingFolder to path to home folder/);
});

test("selectNativeDirectory returns a normalized selected path", async () => {
  const result = await selectNativeDirectory({
    currentPath: "/Users/demo",
    prompt: "选择收件箱目录",
    platform: "darwin",
    run: async (script) => {
      assert.match(script, /选择收件箱目录/);
      return "/Users/demo/My Inbox/\n";
    },
  });

  assert.deepEqual(result, {
    canceled: false,
    path: "/Users/demo/My Inbox/",
  });
});

test("selectNativeDirectory treats an empty result as cancel", async () => {
  const result = await selectNativeDirectory({
    platform: "darwin",
    run: async () => "\n",
  });

  assert.deepEqual(result, { canceled: true, path: "" });
});

test("selectNativeDirectory reports unsupported platforms", async () => {
  await assert.rejects(
    selectNativeDirectory({ platform: "linux" }),
    (error) => error.statusCode === 501 && /手动输入绝对路径/.test(error.message),
  );
});

test("Obsidian directory picker starts from the folder inside the selected Vault", () => {
  assert.equal(resolvePlannerDirectoryPickerStart({
    target: "topic",
    currentPath: "40_行动卡片",
    vaultRoot: "/Users/demo/My Vault",
    workspaceMode: "obsidian",
  }), "/Users/demo/My Vault/40_行动卡片");
});

test("Obsidian directory selection is converted to a Vault-relative path", () => {
  assert.equal(formatPlannerDirectorySelection({
    target: "inbox",
    selectedPath: "/Users/demo/My Vault/素材/收件箱",
    vaultRoot: "/Users/demo/My Vault",
    workspaceMode: "obsidian",
  }), "素材/收件箱");
});

test("Obsidian directory selection rejects folders outside the Vault", () => {
  assert.throws(() => formatPlannerDirectorySelection({
    target: "archive",
    selectedPath: "/Users/demo/Other Folder",
    vaultRoot: "/Users/demo/My Vault",
    workspaceMode: "obsidian",
  }), (error) => error.statusCode === 400 && /Vault 内/.test(error.message));
});

test("Vault selection keeps an absolute path", () => {
  assert.equal(formatPlannerDirectorySelection({
    target: "vault",
    selectedPath: "/Users/demo/My Vault/",
    workspaceMode: "obsidian",
  }), "/Users/demo/My Vault/");
});
