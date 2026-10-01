// Muda a versão do app em todos os arquivos de uma vez.
//
// Uso: npm run version:bump -- <patch | minor | major | X.Y.Z>
//
// Atualiza package.json (fonte da verdade; o tauri.conf.json aponta para ele), package-lock.json,
// src-tauri/Cargo.toml e src-tauri/Cargo.lock. Só grava se todos estiverem na mesma versão antes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  BUMP_KINDS,
  nextVersion,
  readVersions,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
  setPackageLockVersion,
} from "./version.js";

const PACKAGE_NAME = "zona-de-controle";

const files = {
  packageJson: "package.json",
  packageLock: "package-lock.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

function projectPath(relative) {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

function main() {
  const requested = process.argv[2];
  if (!requested) {
    throw new Error(`informe a nova versão: ${BUMP_KINDS.join(", ")} ou X.Y.Z`);
  }

  const contents = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, readFileSync(projectPath(path), "utf8")]),
  );

  const versions = readVersions(contents, PACKAGE_NAME);
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1) {
    const list = Object.entries(versions)
      .map(([file, version]) => `  ${file}: ${version ?? "(não encontrada)"}`)
      .join("\n");
    throw new Error(`as versões estão diferentes entre os arquivos; alinhe antes:\n${list}`);
  }

  const current = versions["package.json"];
  const next = nextVersion(current, requested);

  const updated = {
    packageJson: setPackageJsonVersion(contents.packageJson, next),
    packageLock: setPackageLockVersion(contents.packageLock, next),
    cargoToml: setCargoTomlVersion(contents.cargoToml, next),
    cargoLock: setCargoLockVersion(contents.cargoLock, next, PACKAGE_NAME),
  };
  for (const [key, path] of Object.entries(files)) {
    writeFileSync(projectPath(path), updated[key]);
  }

  console.log(`Versão ${current} → ${next}.`);
  console.log("Próximos passos: rode as validações do CLAUDE.md e faça o commit.");
}

try {
  main();
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
