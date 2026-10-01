import { describe, expect, it } from "vitest";

import {
  compareVersions,
  nextVersion,
  parseVersion,
  readVersions,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageJsonVersion,
  setPackageLockVersion,
} from "./version.js";

const CARGO_TOML = `[package]
name = "zona-de-controle"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
`;

const CARGO_LOCK = `[[package]]
name = "zlib-rs"
version = "0.5.0"

[[package]]
name = "zona-de-controle"
version = "0.1.0"
dependencies = [
 "serde",
]
`;

const PACKAGE_JSON = `{
  "name": "zona-de-controle",
  "version": "0.1.0",
  "dependencies": {
    "react": "^19.3.0"
  }
}
`;

const PACKAGE_LOCK = `{
  "name": "zona-de-controle",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "zona-de-controle",
      "version": "0.1.0"
    },
    "node_modules/react": {
      "version": "19.3.0"
    }
  }
}
`;

describe("parseVersion", () => {
  it("aceita só X.Y.Z numérico dentro dos limites do MSI", () => {
    expect(parseVersion("0.2.10")).toEqual([0, 2, 10]);
    expect(parseVersion("255.255.65535")).toEqual([255, 255, 65535]);
    expect(() => parseVersion("0.2")).toThrow("versão inválida");
    expect(() => parseVersion("0.2.0-beta")).toThrow("versão inválida");
    expect(() => parseVersion("01.2.0")).toThrow("versão inválida");
    expect(() => parseVersion("256.0.0")).toThrow("fora dos limites");
    expect(() => parseVersion("0.0.65536")).toThrow("fora dos limites");
  });
});

describe("compareVersions", () => {
  it("compara parte a parte como números", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.9", "0.2.0")).toBeLessThan(0);
  });
});

describe("nextVersion", () => {
  it("calcula patch, minor e major", () => {
    expect(nextVersion("0.1.4", "patch")).toBe("0.1.5");
    expect(nextVersion("0.1.4", "minor")).toBe("0.2.0");
    expect(nextVersion("0.1.4", "major")).toBe("1.0.0");
  });

  it("aceita versão explícita só se for maior que a atual", () => {
    expect(nextVersion("0.1.0", "0.3.0")).toBe("0.3.0");
    expect(() => nextVersion("0.2.0", "0.2.0")).toThrow("precisa ser maior");
    expect(() => nextVersion("0.2.0", "0.1.9")).toThrow("precisa ser maior");
    expect(() => nextVersion("0.2.0", "lançamento")).toThrow("versão inválida");
  });
});

describe("arquivos de versão", () => {
  it("troca só a versão do próprio pacote em cada arquivo", () => {
    const cargoToml = setCargoTomlVersion(CARGO_TOML, "0.2.0");
    expect(cargoToml).toContain('version = "0.2.0"\nedition');
    expect(cargoToml).toContain('serde = { version = "1"');

    const cargoLock = setCargoLockVersion(CARGO_LOCK, "0.2.0", "zona-de-controle");
    expect(cargoLock).toContain('name = "zona-de-controle"\nversion = "0.2.0"');
    expect(cargoLock).toContain('name = "zlib-rs"\nversion = "0.5.0"');

    expect(JSON.parse(setPackageJsonVersion(PACKAGE_JSON, "0.2.0"))).toEqual({
      name: "zona-de-controle",
      version: "0.2.0",
      dependencies: { react: "^19.3.0" },
    });

    const lock = JSON.parse(setPackageLockVersion(PACKAGE_LOCK, "0.2.0"));
    expect(lock.version).toBe("0.2.0");
    expect(lock.packages[""].version).toBe("0.2.0");
    expect(lock.packages["node_modules/react"].version).toBe("19.3.0");
  });

  it("mantém a formatação do package.json (2 espaços e quebra de linha no fim)", () => {
    expect(setPackageJsonVersion(PACKAGE_JSON, "0.1.0")).toBe(PACKAGE_JSON);
    expect(setPackageLockVersion(PACKAGE_LOCK, "0.1.0")).toBe(PACKAGE_LOCK);
  });

  it("lê a versão de cada arquivo e acusa quando não encontra", () => {
    expect(
      readVersions(
        {
          packageJson: PACKAGE_JSON,
          packageLock: PACKAGE_LOCK,
          cargoToml: CARGO_TOML,
          cargoLock: CARGO_LOCK,
        },
        "zona-de-controle",
      ),
    ).toEqual({
      "package.json": "0.1.0",
      "package-lock.json": "0.1.0",
      'package-lock.json (packages[""])': "0.1.0",
      "src-tauri/Cargo.toml": "0.1.0",
      "src-tauri/Cargo.lock": "0.1.0",
    });
    expect(() => setCargoLockVersion(CARGO_LOCK, "0.2.0", "outro-pacote")).toThrow(
      "não encontrei a versão em Cargo.lock",
    );
  });
});
