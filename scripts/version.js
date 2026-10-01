// Regras puras do número de versão do app, usadas por `bump-version.js` (testes em `version.test.js`).
//
// A fonte da verdade é o `package.json`: o `tauri.conf.json` aponta para ele. O `Cargo.toml` (e os
// arquivos de lock) precisam acompanhar; um teste do Rust garante que não se separem.

/** Só `X.Y.Z` numérico: o instalador MSI não aceita sufixos (`-beta`) e limita cada parte. */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Limites do MSI: X e Y até 255, Z até 65535. */
const MSI_LIMITS = [255, 255, 65535];

export const BUMP_KINDS = ["major", "minor", "patch"];

/** Lê `X.Y.Z`; lança erro com a mensagem em pt-BR se o formato ou os limites não servirem. */
export function parseVersion(text) {
  const match = VERSION_PATTERN.exec(text);
  if (!match) {
    throw new Error(`versão inválida: "${text}" (use X.Y.Z, por exemplo 0.2.0)`);
  }
  const parts = match.slice(1).map(Number);
  if (parts.some((part, index) => part > MSI_LIMITS[index])) {
    throw new Error(`versão ${text} fora dos limites do instalador (X e Y até 255, Z até 65535)`);
  }
  return parts;
}

/** Negativo se `a` < `b`, zero se iguais, positivo se `a` > `b`. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/**
 * Próxima versão a partir de `requested`: `major`, `minor`, `patch` ou uma versão explícita, que
 * precisa ser maior que a atual (o atualizador só instala versões maiores).
 */
export function nextVersion(current, requested) {
  const [major, minor, patch] = parseVersion(current);
  let next;
  if (requested === "major") next = `${major + 1}.0.0`;
  else if (requested === "minor") next = `${major}.${minor + 1}.0`;
  else if (requested === "patch") next = `${major}.${minor}.${patch + 1}`;
  else next = requested;

  if (compareVersions(next, current) <= 0) {
    throw new Error(`a nova versão (${next}) precisa ser maior que a atual (${current})`);
  }
  return next;
}

/** `package.json`: troca o campo `version` da raiz. */
export function setPackageJsonVersion(text, version) {
  const json = JSON.parse(text);
  json.version = version;
  return `${JSON.stringify(json, null, 2)}\n`;
}

/** `package-lock.json`: a versão aparece na raiz e no pacote raiz (`packages[""]`). */
export function setPackageLockVersion(text, version) {
  const json = JSON.parse(text);
  json.version = version;
  json.packages[""].version = version;
  return `${JSON.stringify(json, null, 2)}\n`;
}

/** `Cargo.toml`: a primeira linha `version = "…"` da seção `[package]`. */
export function setCargoTomlVersion(text, version) {
  return replaceOnce(text, /(^\[package\][^[]*?^version = ")[^"]*(")/m, version, "Cargo.toml");
}

/** `Cargo.lock`: o bloco do próprio pacote. */
export function setCargoLockVersion(text, version, packageName) {
  const pattern = new RegExp(`(^name = "${packageName}"\\r?\\nversion = ")[^"]*(")`, "m");
  return replaceOnce(text, pattern, version, "Cargo.lock");
}

/** Versão atual lida de cada arquivo, para conferir que estão alinhados antes de mudar. */
export function readVersions({ packageJson, packageLock, cargoToml, cargoLock }, packageName) {
  const lock = JSON.parse(packageLock);
  return {
    "package.json": JSON.parse(packageJson).version,
    "package-lock.json": lock.version,
    'package-lock.json (packages[""])': lock.packages[""].version,
    "src-tauri/Cargo.toml": /^\[package\][^[]*?^version = "([^"]*)"/m.exec(cargoToml)?.[1],
    "src-tauri/Cargo.lock": new RegExp(
      `^name = "${packageName}"\\r?\\nversion = "([^"]*)"`,
      "m",
    ).exec(cargoLock)?.[1],
  };
}

function replaceOnce(text, pattern, version, fileName) {
  if (!pattern.test(text)) {
    throw new Error(`não encontrei a versão em ${fileName}`);
  }
  return text.replace(pattern, (_match, before, after) => `${before}${version}${after}`);
}
