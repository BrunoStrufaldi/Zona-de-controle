import { type ModuleInfo } from "@/types/module";

export const financeModules = {
  overview: {
    description: "Receita, despesas, saldo líquido e percentual de economia em um só lugar.",
    phase: 5,
    plannedFeatures: [
      "Receita total e despesas totais",
      "Saldo líquido do período",
      "Percentual de economia",
    ],
  },
  transactions: {
    description: "Entradas e saídas com categorias, tags e status de pagamento.",
    phase: 5,
    plannedFeatures: [
      "Data, descrição, categoria, tags e valor",
      "Tipo (Entrada/Saída) e status (Pago/Pendente)",
      "Filtros por mês, ano, categoria, tipo, status e faixa de valor",
    ],
  },
  recurring: {
    description: "Contas fixas como aluguel, internet, energia e assinaturas.",
    phase: 5,
    plannedFeatures: [
      "Frequência, valor e vencimento",
      "Status de pagamento",
      "Controle de renovação",
    ],
  },
  installments: {
    description: "Compras parceladas e o impacto delas nos próximos meses.",
    phase: 5,
    plannedFeatures: [
      "Valor total, número de parcelas e parcela atual",
      "Cálculo do mês final e das parcelas restantes",
      "Valor comprometido por mês e projeção de redução",
    ],
  },
  investments: {
    description: "Carteira de investimentos, patrimônio e rentabilidade.",
    phase: 6,
    plannedFeatures: [
      "Renda Fixa, Ações, FIIs, ETFs, Cripto e Outros",
      "Quantidade, preço médio, valor investido e valor atual",
      "Patrimônio total, distribuição, evolução e rentabilidade",
    ],
  },
  analytics: {
    description: "Gráficos e projeções para entender para onde vai o seu dinheiro.",
    phase: 7,
    plannedFeatures: [
      "Receita x despesa por mês e gastos por categoria",
      "Evolução patrimonial e fluxo de caixa",
      "Projeção de 6 meses e impacto das parcelas futuras",
    ],
  },
} as const satisfies Record<string, ModuleInfo>;
