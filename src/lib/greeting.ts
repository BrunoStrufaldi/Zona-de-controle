export type Greeting = "Bom dia" | "Boa tarde" | "Boa noite";

/** Saudação de acordo com a hora local (05h–11h59 dia, 12h–17h59 tarde). */
export function getGreeting(date: Date = new Date()): Greeting {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}
