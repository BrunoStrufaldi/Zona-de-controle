import {
  type FindingText,
  type GuideTopic,
  NOT_AVAILABLE,
} from "@/features/system/system-settings/domain/settings";
import {
  type BoardInfo,
  type FirmwareKind,
  type HardwareFinding,
  type MemoryKind,
  type MemorySpeed,
  type TpmStatus,
  type VirtualizationState,
} from "@/features/system/system-settings/types";
import { formatMonthYear, formatNumber } from "@/lib/format";

/** Revisão de microcódigo como a Intel publica (ex.: 0x12F). */
export function formatMicrocode(revision: number): string {
  return `0x${revision.toString(16).toUpperCase()}`;
}

export function formatSpeed(mts: number): string {
  return `${formatNumber(mts)} MT/s`;
}

export const memoryKindLabels: Record<MemoryKind, string> = {
  ddr3: "DDR3",
  ddr4: "DDR4",
  ddr5: "DDR5",
  lpddr4: "LPDDR4",
  lpddr5: "LPDDR5",
};

export const firmwareLabels: Record<FirmwareKind, string> = {
  uefi: "UEFI",
  legacy: "BIOS legado",
};

export const tpmLabels: Record<TpmStatus, string> = {
  tpm20: "TPM 2.0",
  tpm12: "TPM 1.2",
  notFound: "Não encontrado",
};

export const virtualizationLabels: Record<VirtualizationState, string> = {
  inUse: "Ativada (em uso pelo Windows)",
  enabled: "Ativada",
  disabled: "Desativada",
};

export function secureBootLabel(secureBoot: boolean | null, firmware: FirmwareKind | null): string {
  if (firmware === "legacy") return "Não se aplica (BIOS legado)";
  if (secureBoot === null) return NOT_AVAILABLE;
  return secureBoot ? "Ligado" : "Desligado";
}

function slotName(module: MemorySpeed): string {
  return module.locator ?? "Módulo";
}

/** Título, dados e recomendação de um achado do hardware. */
export function describeHardwareFinding(finding: HardwareFinding): FindingText {
  switch (finding.kind) {
    case "microcodeOutdated":
      return {
        title: "Microcódigo do processador desatualizado",
        detail: `Revisão ${formatMicrocode(finding.revision)} · as correções da Intel começam na ${formatMicrocode(finding.minimum)}`,
        recommendation:
          "Processadores Intel de 13ª e 14ª geração para desktop podem ficar instáveis e se degradar com o microcódigo antigo. Atualize a BIOS para uma versão com o microcódigo novo (a página de suporte da placa-mãe informa qual).",
        guide: "biosUpdate",
      };
    case "memoryBelowRated":
      return {
        title: "Memória abaixo da velocidade informada",
        detail: finding.modules
          .map(
            (module) =>
              `${slotName(module)}: ${formatSpeed(module.configuredMts)} de ${formatSpeed(module.maxMts)}`,
          )
          .join(" · "),
        recommendation:
          "Pode ser o perfil XMP (Intel) ou EXPO (AMD) desligado na BIOS. Não é certeza: algumas placas informam esses valores de outro jeito. Confira na BIOS antes de mudar.",
        guide: "memoryProfile",
      };
    case "mixedMemoryModules":
      return {
        title: "Módulos de memória de modelos diferentes",
        detail: finding.partNumbers.join(" · "),
        recommendation:
          "Funciona, mas módulos diferentes podem não ficar estáveis no perfil XMP/EXPO. Se o PC travar com o perfil ligado, teste numa velocidade menor ou com módulos iguais.",
      };
    case "biosAge":
      return {
        title: `BIOS de ${formatMonthYear(finding.releaseDate)}`,
        detail: `${formatNumber(finding.months)} meses desde a versão instalada`,
        recommendation:
          "O app não acessa a internet e não sabe se existe versão mais nova. Confira na página de suporte da placa-mãe e atualize só se a versão nova trouxer algo de que você precisa (estabilidade, segurança, suporte a processador).",
        guide: "biosUpdate",
      };
    case "secureBootOff":
      return {
        title: "Secure Boot desligado",
        detail: "Proteção da inicialização do Windows",
        recommendation:
          "Impede que programas maliciosos rodem antes do Windows e é exigido por alguns jogos com anti-cheat. Ligue na BIOS; exige o disco do sistema em GPT e o CSM desligado.",
        guide: "secureBoot",
      };
    case "tpmMissing":
      return {
        title: finding.status === "tpm12" ? "TPM 1.2" : "TPM não encontrado",
        detail: "O Windows 11 exige TPM 2.0",
        recommendation:
          "Nos PCs atuais o TPM fica no processador e vem desligado em algumas placas: ative na BIOS como Intel PTT ou AMD fTPM.",
        guide: "tpm",
      };
  }
}

type BoardVendor = "asus" | "msi" | "gigabyte" | "asrock";

export function boardVendor(board: BoardInfo | null): BoardVendor | null {
  const name = board?.manufacturer?.toLowerCase() ?? "";
  if (name.includes("asus")) return "asus";
  if (name.includes("micro-star") || name.includes("msi")) return "msi";
  if (name.includes("gigabyte")) return "gigabyte";
  if (name.includes("asrock")) return "asrock";
  return null;
}

const vendorNames: Record<BoardVendor, string> = {
  asus: "ASUS",
  msi: "MSI",
  gigabyte: "Gigabyte",
  asrock: "ASRock",
};

const flashTools: Record<BoardVendor, string> = {
  asus: "a ferramenta EZ Flash (Tool > ASUS EZ Flash 3 Utility)",
  msi: "a ferramenta M-Flash",
  gigabyte: "a ferramenta Q-Flash",
  asrock: "a ferramenta Instant Flash",
};

const memoryProfileMenus: Record<BoardVendor, string> = {
  asus: "Ai Tweaker > Ai Overclock Tuner",
  msi: "OC > Extreme Memory Profile (XMP)",
  gigabyte: "Tweaker > Extreme Memory Profile (X.M.P.)",
  asrock: "OC Tweaker > DRAM Configuration > Load XMP Setting",
};

const ENTER_BIOS =
  "Reinicie o computador e, logo que ele ligar, aperte a tecla Delete (em alguns modelos, F2) até abrir a BIOS.";
const SAVE_AND_EXIT = "Salve e saia (normalmente F10) e confirme.";

export interface BiosGuide {
  title: string;
  steps: string[];
  warnings: string[];
}

/** Passo a passo na BIOS. O app nunca altera a BIOS: só explica. */
export function biosGuide(
  topic: GuideTopic,
  board: BoardInfo | null,
  biosVersion: string | null,
): BiosGuide {
  const vendor = boardVendor(board);
  const model = board?.product ?? "da sua placa-mãe";
  switch (topic) {
    case "biosUpdate":
      return {
        title: "Atualizar a BIOS",
        steps: [
          `No site da ${vendor ? vendorNames[vendor] : "fabricante da placa-mãe"}, abra a página de suporte do modelo ${model} e veja a lista de versões da BIOS${biosVersion ? ` (a instalada é a ${biosVersion})` : ""}.`,
          "Leia o que mudou em cada versão. Se a mais nova trouxer algo de que você precisa, baixe-a.",
          "Extraia o arquivo e copie-o para um pen drive formatado em FAT32.",
          ENTER_BIOS,
          `Abra ${vendor ? flashTools[vendor] : "a ferramenta de atualização da BIOS"}, escolha o arquivo no pen drive e confirme.`,
          "Espere terminar: o computador reinicia sozinho, às vezes mais de uma vez.",
          "Depois da atualização as configurações voltam ao padrão: reative o perfil de memória (XMP/EXPO) e confira o Secure Boot e a ordem de inicialização.",
        ],
        warnings: [
          "Não desligue nem reinicie o computador durante a atualização: faltar energia no meio pode inutilizar a placa-mãe. Se puder, use um nobreak.",
          "Use só o arquivo do site da fabricante, para exatamente o modelo da sua placa.",
        ],
      };
    case "memoryProfile":
      return {
        title: "Ligar o perfil de memória (XMP/EXPO)",
        steps: [
          ENTER_BIOS,
          vendor
            ? `Procure ${memoryProfileMenus[vendor]} (pode ser preciso abrir o modo avançado, F7).`
            : "Procure a opção XMP (Intel) ou EXPO/DOCP (AMD), normalmente nas seções de overclock ou de memória (pode ser preciso abrir o modo avançado).",
          "Escolha o perfil 1 (XMP I ou EXPO I).",
          SAVE_AND_EXIT,
          "Volte aqui e leia de novo: a velocidade configurada deve ficar igual à informada pelo módulo.",
        ],
        warnings: [
          "O perfil é um overclock certificado pelo fabricante da memória: a maioria dos PCs fica estável, mas não é garantido.",
          "Se o computador não ligar ou travar depois, volte a BIOS ao padrão (a maioria das placas faz isso sozinha depois de algumas tentativas).",
        ],
      };
    case "secureBoot":
      return {
        title: "Ligar o Secure Boot",
        steps: [
          "Antes, no Windows, abra Gerenciamento de Disco, clique com o botão direito no disco do sistema > Propriedades > Volumes e confirme que o estilo da partição é GPT.",
          ENTER_BIOS,
          vendor === "asus"
            ? "Em Boot, desligue o CSM (Compatibility Support Module) e, em Boot > Secure Boot, escolha OS Type: Windows UEFI mode."
            : "Na seção Boot (ou Security), desligue o CSM (Compatibility Support Module) e ligue o Secure Boot (modo padrão/Windows UEFI).",
          SAVE_AND_EXIT,
        ],
        warnings: [
          "Com o disco do sistema em MBR, desligar o CSM impede o Windows de iniciar. Se for MBR, não continue: a conversão para GPT é outro procedimento.",
        ],
      };
    case "tpm":
      return {
        title: "Ativar o TPM",
        steps: [
          ENTER_BIOS,
          "Procure Intel Platform Trust Technology (PTT), em processadores Intel, ou AMD fTPM, em processadores AMD, normalmente nas seções Advanced ou Security, e ative.",
          SAVE_AND_EXIT,
          "Volte aqui e leia de novo: deve aparecer TPM 2.0.",
        ],
        warnings: [
          "Se o BitLocker estiver em uso, tenha a chave de recuperação à mão antes de mexer no TPM.",
        ],
      };
  }
}

export function boardLabel(board: BoardInfo | null): string {
  const parts = [board?.manufacturer, board?.product].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : NOT_AVAILABLE;
}
