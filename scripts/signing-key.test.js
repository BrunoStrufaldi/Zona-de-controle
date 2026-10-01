import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { publicKeyId, signatureKeyId } from "./signing-key.js";

// Par de chaves descartável, gerado só para este teste (a privada não existe mais).
const TEST_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDYxQjNFOUQ1MzJGMjg1NkQKUldSdGhmSXkxZW16WVF5SlpYdGhiUnZ3VzZoWlAySjE4d2dQaGc0dWxRd1ErbC82bEhtcngwMW8K";
const TEST_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSdGhmSXkxZW16WVZ0Nk02SjdKemhHQmFTNjFOREpsYytwRXJORnh6OVU4eG9EQm91ZUJCN3d5bGdPTi9zWmhkVmc5bFA5VEx1Q1F3SjYvcFd4UWVpdXN3L2tSOXNyUmdvPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwODkwMjI4CWZpbGU6Zi50eHQKWVhPTnBEM1d0N3JYbzNLUXltM3RrVlVyS3dSMDNQSXl4U0R0d3luM3R5UVRNZTJDWHh2UFdOZG9FSFZtd0pNVjVZWTJqemJVQTJCMjlWSkVLVStQRHc9PQo=";

describe("chave de assinatura do atualizador", () => {
  it("lê o identificador da chave pública e da assinatura", () => {
    expect(publicKeyId(TEST_PUBKEY)).toBe("61B3E9D532F2856D");
    expect(signatureKeyId(`${TEST_SIGNATURE}\n`)).toBe("61B3E9D532F2856D");
  });

  it("a chave pública do app tem o identificador gerado pelo usuário", () => {
    const config = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"));
    expect(publicKeyId(config.plugins.updater.pubkey)).toBe("A2DF320CAC1E928C");
  });

  it("recusa textos que não são chave nem assinatura", () => {
    expect(() => publicKeyId("")).toThrow("chave pública em formato inválido");
    expect(() => signatureKeyId(Buffer.from("qualquer coisa").toString("base64"))).toThrow(
      "assinatura em formato inválido",
    );
  });
});
