import { formatLongDate } from "@/lib/format";
import { getGreeting } from "@/lib/greeting";

interface GreetingBannerProps {
  displayName?: string | null;
  now?: Date;
}

export function GreetingBanner({ displayName, now = new Date() }: GreetingBannerProps) {
  const greeting = getGreeting(now);
  const title = displayName ? `${greeting}, ${displayName}` : greeting;

  return (
    <section
      aria-labelledby="dashboard-greeting"
      className="relative animate-slide-up overflow-hidden rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/15 blur-3xl"
      />
      <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
        {formatLongDate(now)}
      </p>
      <h1 id="dashboard-greeting" className="mt-2 text-3xl font-semibold tracking-tight">
        {title}
      </h1>
    </section>
  );
}
