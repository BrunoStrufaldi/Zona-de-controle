// Confere, antes do build, se a assinatura de teste saiu da chave cuja parte pública está no app.
//
// Uso (na CI de publicação): node scripts/check-signing-key.js <arquivo.sig>
//
// O Tauri só avisa quando a chave não bate; aqui é erro, porque uma versão assinada com outra
// chave seria recusada por todos os apps instalados.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { publicKeyId, signatureKeyId } from "./signing-key.js";

function main() {
  const signaturePath = process.argv[2];
  if (!signaturePath) {
    throw new Error("informe o arquivo .sig da assinatura de teste");
  }
  const configPath = fileURLToPath(new URL("../src-tauri/tauri.conf.json", import.meta.url));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const expected = publicKeyId(config.plugins.updater.pubkey);
  const actual = signatureKeyId(readFileSync(signaturePath, "utf8"));

  if (actual !== expected) {
    throw new Error(
      `a chave dos Secrets (${actual}) não é a do app (${expected}); confira TAURI_SIGNING_PRIVATE_KEY`,
    );
  }
  console.log(`Chave de assinatura confere com a do app (${expected}).`);
}

try {
  main();
} catch (error) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
