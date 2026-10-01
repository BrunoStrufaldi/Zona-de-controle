// Regras puras para conferir a chave de assinatura do atualizador (testes em `signing-key.test.js`).
//
// Chaves e assinaturas minisign geradas pelo Tauri vêm em base64 de um texto de duas (chave) ou
// quatro (assinatura) linhas. A segunda linha, também em base64, começa com 2 bytes do algoritmo
// seguidos dos 8 bytes do identificador da chave: é ele que diz se a assinatura saiu da chave cuja
// parte pública está embutida no app. O minisign mostra o identificador com os bytes invertidos
// (little-endian), como em "minisign public key: A2DF320CAC1E928C".

const KEY_ID_START = 2;
const KEY_ID_END = 10;

function keyIdFromBox(base64Text, what) {
  const text = Buffer.from(base64Text.trim(), "base64").toString("utf8");
  const [comment, payload] = text.split(/\r?\n/);
  if (!comment?.startsWith("untrusted comment:") || !payload) {
    throw new Error(`${what} em formato inválido`);
  }
  const bytes = Buffer.from(payload.trim(), "base64");
  if (bytes.length < KEY_ID_END) {
    throw new Error(`${what} em formato inválido`);
  }
  return Buffer.from(bytes.subarray(KEY_ID_START, KEY_ID_END))
    .reverse()
    .toString("hex")
    .toUpperCase();
}

/** Identificador da chave pública (`plugins.updater.pubkey` do tauri.conf.json). */
export function publicKeyId(pubkeyBase64) {
  return keyIdFromBox(pubkeyBase64, "chave pública");
}

/** Identificador da chave que gerou uma assinatura `.sig` do Tauri. */
export function signatureKeyId(signatureBase64) {
  return keyIdFromBox(signatureBase64, "assinatura");
}
