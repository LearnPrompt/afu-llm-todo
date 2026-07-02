import { execFile } from "node:child_process";
import path from "node:path";

function toAppleScriptString(value) {
  return `"${String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '" & linefeed & "')}"`;
}

function buildMacOSDirectoryPickerScript({ currentPath = "", prompt = "选择文件夹" } = {}) {
  const startingFolderScript = path.isAbsolute(currentPath)
    ? `try
  set requestedPath to POSIX file ${toAppleScriptString(currentPath)} as alias
  set startingFolder to requestedPath
end try`
    : "";

  return `
set startingFolder to path to home folder
${startingFolderScript}

try
  set selectedFolder to choose folder with prompt ${toAppleScriptString(prompt)} default location startingFolder
  return POSIX path of selectedFolder
on error errorMessage number errorNumber
  if errorNumber is -128 then return ""
  error errorMessage number errorNumber
end try
`;
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", script],
      {
        cwd: process.env.HOME || process.cwd(),
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      },
      (error, stdout, stderr) => {
        if (error) {
          const pickerError = new Error(stderr?.trim() || stdout?.trim() || error.message);
          pickerError.code = error.code;
          reject(pickerError);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function selectNativeDirectory({
  currentPath = "",
  prompt = "选择文件夹",
  platform = process.platform,
  run = runAppleScript,
} = {}) {
  if (platform !== "darwin") {
    const error = new Error("当前系统暂不支持文件夹选择器，请手动输入绝对路径。");
    error.statusCode = 501;
    throw error;
  }

  const script = buildMacOSDirectoryPickerScript({ currentPath, prompt });
  const output = String(await run(script)).trim();
  if (!output) {
    return { canceled: true, path: "" };
  }

  return {
    canceled: false,
    path: path.normalize(output),
  };
}

function resolvePlannerDirectoryPickerStart({
  target,
  currentPath = "",
  vaultRoot = "",
  workspaceMode = "standalone",
} = {}) {
  if (target === "vault" || workspaceMode !== "obsidian") {
    return currentPath;
  }
  if (!path.isAbsolute(vaultRoot)) {
    return "";
  }

  const resolvedVaultRoot = path.resolve(vaultRoot);
  const resolvedCurrentPath = path.resolve(resolvedVaultRoot, currentPath);
  const relative = path.relative(resolvedVaultRoot, resolvedCurrentPath);
  const isInsideVault = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  return isInsideVault ? resolvedCurrentPath : resolvedVaultRoot;
}

function formatPlannerDirectorySelection({
  target,
  selectedPath,
  vaultRoot = "",
  workspaceMode = "standalone",
} = {}) {
  const normalizedPath = path.normalize(selectedPath);
  if (target === "vault" || workspaceMode !== "obsidian") {
    return normalizedPath;
  }
  if (!path.isAbsolute(vaultRoot)) {
    const error = new Error("请先选择 Vault 根目录");
    error.statusCode = 400;
    throw error;
  }

  const resolvedVaultRoot = path.resolve(vaultRoot);
  const relative = path.relative(resolvedVaultRoot, normalizedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("请选择当前 Vault 内的文件夹");
    error.statusCode = 400;
    throw error;
  }
  return relative || ".";
}

export {
  buildMacOSDirectoryPickerScript,
  formatPlannerDirectorySelection,
  resolvePlannerDirectoryPickerStart,
  selectNativeDirectory,
};
