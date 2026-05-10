import Link from "next/link";
import type { Metadata } from "next";
import {
  Bell,
  ChartColumnBig,
  CircleDot,
  Clock3,
  History,
  Lightbulb,
  ListChecks,
  PieChart,
  Search,
  Settings,
  Shield,
} from "lucide-react";

type PageSearchParams = Record<string, string | string[] | undefined>;
type PreviewTab = "daily" | "advisor" | "portfolio" | "planning" | "autonomy";

const TOP_TABS: Array<{ key: PreviewTab; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "advisor", label: "Advisor" },
  { key: "portfolio", label: "Portfolio" },
  { key: "planning", label: "Plan" },
  { key: "autonomy", label: "Autonomy" },
];

export const metadata: Metadata = {
  title: "Syntrake Structure Preview",
  description: "Preview-only structural mock to validate tab layout before touching production screens.",
};

function asTab(value: string | null | undefined): PreviewTab {
  const v = String(value || "").toLowerCase().trim();
  if (v === "advisor") return "advisor";
  if (v === "portfolio") return "portfolio";
  if (v === "planning" || v === "plan") return "planning";
  if (v === "autonomy") return "autonomy";
  return "daily";
}

function TopNav({ tab }: { tab: PreviewTab }) {
  return (
    <header className="rounded-2xl border border-[#6c84be]/40 bg-gradient-to-r from-[#2d4274]/90 via-[#283a65]/90 to-[#2b3d68]/90 px-4 py-3 shadow-[0_18px_38px_rgba(3,9,24,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/35 bg-white/10 text-sm font-bold text-white">S</div>
            <span className="text-3xl font-semibold tracking-tight text-white">Syntrake</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {TOP_TABS.map((item) => (
              <Link
                key={item.key}
                href={`/structure-preview?tab=${item.key}`}
                className={`rounded-lg px-3 py-2 text-lg transition ${
                  tab === item.key
                    ? "border-b-2 border-cyan-300 bg-white/10 text-white"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-slate-100 sm:flex">
            <Search className="h-4 w-4" />
            Search
          </div>
          <button className="rounded-full border border-white/20 bg-white/10 p-2 text-slate-100">
            <Bell className="h-4 w-4" />
          </button>
          <span className="rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-xs font-semibold text-slate-100">
            Premium
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-white/10 text-xs font-semibold text-white">
            S
          </span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ tab }: { tab: PreviewTab }) {
  const items: Array<{ key: PreviewTab | "opportunities" | "history"; label: string; icon: React.ReactNode }> = [
    { key: "daily", label: "Daily", icon: <ListChecks className="h-4 w-4" /> },
    { key: "advisor", label: "Advisor", icon: <Lightbulb className="h-4 w-4" /> },
    { key: "portfolio", label: "Portfolio", icon: <PieChart className="h-4 w-4" /> },
    { key: "opportunities", label: "Opportunities", icon: <ChartColumnBig className="h-4 w-4" /> },
    { key: "history", label: "History", icon: <History className="h-4 w-4" /> },
    { key: "autonomy", label: "Autonomy", icon: <Shield className="h-4 w-4" /> },
  ];

  return (
    <aside className="hidden w-64 shrink-0 xl:block">
      <div className="h-full rounded-2xl border border-[#7a92c8]/35 bg-[#e9edf8]/5 p-3 text-slate-100 backdrop-blur">
        <div className="space-y-1">
          {items.map((item) => {
            const selected = item.key === tab;
            const href = item.key === "opportunities" || item.key === "history" ? "#" : `/structure-preview?tab=${item.key}`;
            const content = (
              <div
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-lg transition ${
                  selected
                    ? "border border-white/35 bg-white/15 text-white shadow-[0_8px_20px_rgba(6,11,28,0.4)]"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="opacity-90">{item.icon}</span>
                {item.label}
              </div>
            );

            return item.key === "opportunities" || item.key === "history" ? (
              <div key={item.label}>{content}</div>
            ) : (
              <Link key={item.label} href={href}>
                {content}
              </Link>
            );
          })}
        </div>
        <div className="mt-8 border-t border-white/15 pt-4">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-lg text-slate-200 hover:bg-white/10 hover:text-white">
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}

function GlassCard({
  title,
  children,
  className = "",
  subtitle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-[#8aa4dc]/30 bg-gradient-to-br from-white/[0.11] via-white/[0.07] to-white/[0.04] p-5 text-slate-100 shadow-[0_16px_36px_rgba(2,8,22,0.5)] backdrop-blur-sm ${className}`}
    >
      <h3 className="text-[2rem] font-semibold tracking-tight text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Meter({
  label,
  value,
  barClass,
}: {
  label: string;
  value: string;
  barClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-lg">
        <span>{label}</span>
        <span className="font-semibold text-slate-100">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-800/80">
        <div className={`h-2.5 rounded-full ${barClass}`} style={{ width: value }} />
      </div>
    </div>
  );
}

function DailyLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight text-white">Today&apos;s Decision</h1>

      <div className="grid gap-4 xl:grid-cols-12">
        <GlassCard title="WAIT" subtitle="Posture: CAUTION" className="xl:col-span-6">
          <p className="text-xl text-slate-200">Probabilidade stable path: 61%</p>
          <div className="mt-4 rounded-2xl border border-white/20 bg-slate-900/30 p-4">
            <div className="h-1 rounded-full bg-gradient-to-r from-emerald-300/80 via-cyan-300/70 to-blue-400/70" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm text-slate-300">
              <div>DEFENSIVE</div>
              <div>BASE</div>
              <div>ACCELERATED</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Marketa Pulse" className="xl:col-span-3">
          <div className="space-y-3 text-lg">
            <div>Trend: Uptrend</div>
            <div className="flex items-center gap-2 text-slate-200">
              <CircleDot className="h-4 w-4 text-emerald-300" />
              Volatilidade: High
            </div>
            <div className="h-3 rounded-full bg-slate-800/80">
              <div className="h-3 w-[78%] rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-slate-300" />
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Improvement Plan" className="xl:col-span-3">
          <div className="space-y-4 text-lg">
            <div className="space-y-2">
              <div>Capturar prova hoje</div>
              <div className="h-2 rounded-full bg-slate-800/80">
                <div className="h-2 w-[65%] rounded-full bg-emerald-300" />
              </div>
            </div>
            <div className="space-y-2">
              <div>Limitar exposicao a 5%</div>
              <div className="h-2 rounded-full bg-slate-800/80">
                <div className="h-2 w-[55%] rounded-full bg-cyan-300" />
              </div>
            </div>
            <div>Logar 1 recibo esta semana</div>
          </div>
        </GlassCard>

        <GlassCard title="Market Pulse" className="xl:col-span-6">
          <div className="space-y-3 text-xl text-slate-200">
            <p>Trend: Uptrend</p>
            <p>Volatilidade: High</p>
            <p className="text-lg">
              O mercado esta em tendencia de subida, mas a volatilidade continua elevada. Syntrake recomenda nao aumentar
              exposicao hoje.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-lg">Day 3 / 7 cycle</button>
            <button className="rounded-xl border border-blue-300/50 bg-blue-500/30 px-4 py-2 text-lg text-white">
              Complete Daily Loop
            </button>
          </div>
        </GlassCard>

        <GlassCard title="Daily loop completa" className="xl:col-span-3">
          <div className="space-y-4 text-xl">
            <div className="flex items-center gap-2 text-emerald-300">
              <CircleDot className="h-4 w-4" />
              Streak: 5 days
            </div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3 text-lg text-slate-200">
              Syntrake rewards disciplined decisions.
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Risk Governance" className="xl:col-span-3">
          <p className="text-lg text-slate-200">Target exposure: 10%</p>
          <div className="mt-4 rounded-full border border-white/20 bg-slate-900/30 p-5 text-center">
            <div className="text-5xl font-semibold text-cyan-200">8%</div>
            <div className="mt-1 text-sm text-slate-300">Current exposure</div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function AdvisorLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight text-white">Advisor</h1>

      <div className="grid gap-4 xl:grid-cols-12">
        <GlassCard title="Today&apos;s Decision" className="xl:col-span-4">
          <div className="text-6xl font-semibold text-amber-200">REDUCE RISK</div>
          <p className="mt-3 text-2xl text-slate-200">Market regime is unstable. Consider reducing exposure.</p>
          <div className="mt-6 flex gap-3">
            <button className="rounded-xl border border-blue-200/50 bg-blue-500/30 px-5 py-2.5 text-xl">Wait</button>
            <button className="rounded-xl border border-emerald-200/50 bg-emerald-500/40 px-5 py-2.5 text-xl">Execute</button>
          </div>
        </GlassCard>

        <GlassCard title="Market Pulse" className="xl:col-span-4">
          <div className="rounded-full border border-white/20 bg-slate-900/30 px-5 py-8 text-center">
            <p className="text-3xl font-semibold tracking-wide text-amber-200">VOLATILE</p>
          </div>
          <p className="mt-4 text-2xl text-slate-200">Rising risk, weakening trend.</p>
        </GlassCard>

        <GlassCard title="Opportunity Outlook" className="xl:col-span-4">
          <div className="space-y-4">
            <Meter label="Large-Cap Continuation" value="64%" barClass="bg-cyan-300" />
            <Meter label="Defensive Rotation" value="56%" barClass="bg-amber-300" />
            <Meter label="Global Core Rotation" value="46%" barClass="bg-blue-400" />
          </div>
        </GlassCard>

        <GlassCard title="Today&apos;s Actions" className="xl:col-span-8">
          <div className="space-y-4 text-2xl">
            <div className="rounded-2xl border border-white/15 bg-slate-900/30 p-4">Decrease Tech exposure - HIGH</div>
            <div className="rounded-2xl border border-white/15 bg-slate-900/30 p-4">Rebalance bonds - ON TRACK</div>
          </div>
        </GlassCard>

        <GlassCard title="Opportunity Table" className="xl:col-span-4">
          <div className="space-y-3 text-lg text-slate-200">
            <div className="flex items-center justify-between">
              <span>Large-Cap Continuation</span>
              <span className="font-semibold text-cyan-200">60%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Defensive Rotation</span>
              <span className="font-semibold text-cyan-200">54%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Global Core Rotation</span>
              <span className="font-semibold text-amber-200">46%</span>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard title="Daily Loop">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-slate-900/30 p-4 text-lg">14. Reduced exposure: 62% -&gt; 49%</div>
          <div className="rounded-2xl border border-white/15 bg-slate-900/30 p-4 text-lg">19. Wait decision: mild volatility and weak trend</div>
          <div className="rounded-2xl border border-white/15 bg-slate-900/30 p-4 text-lg">18. Analyzing opportunity: global core rotation</div>
        </div>
      </GlassCard>
    </div>
  );
}

function PortfolioLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight text-white">Portfolio</h1>

      <div className="grid gap-4 xl:grid-cols-12">
        <GlassCard title="Portfolio Health" className="xl:col-span-4">
          <div className="space-y-3 text-xl text-slate-200">
            <p>Concentration risk: Medium</p>
            <p>Diversification score: 68/100</p>
            <p>Volatility exposure: Elevated</p>
            <p>Correlation clusters: 2 detected</p>
          </div>
        </GlassCard>

        <GlassCard title="Exposure Radar" className="xl:col-span-4">
          <Meter label="Equities" value="52%" barClass="bg-cyan-300" />
          <div className="mt-3" />
          <Meter label="Bonds" value="30%" barClass="bg-emerald-300" />
          <div className="mt-3" />
          <Meter label="Gold" value="18%" barClass="bg-amber-300" />
        </GlassCard>

        <GlassCard title="Action Focus" className="xl:col-span-4">
          <div className="space-y-3 text-lg text-slate-200">
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3">Reduce single-position cap breach</div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3">Deploy idle cash in 2-4 tranches</div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3">Validate execution receipt quality</div>
          </div>
        </GlassCard>

        <GlassCard title="Holdings Matrix" className="xl:col-span-12">
          <div className="grid grid-cols-5 gap-2 rounded-2xl border border-white/20 bg-slate-900/25 p-3 text-sm text-slate-200">
            <div className="font-semibold">Asset</div>
            <div className="font-semibold">Weight</div>
            <div className="font-semibold">Value</div>
            <div className="font-semibold">Target</div>
            <div className="font-semibold">Action</div>
            <div>SPY</div>
            <div>34%</div>
            <div>340 EUR</div>
            <div>22%</div>
            <div className="text-amber-200">Reduce</div>
            <div>AGGH</div>
            <div>45%</div>
            <div>450 EUR</div>
            <div>45%</div>
            <div className="text-slate-100">Hold</div>
            <div>GLD</div>
            <div>21%</div>
            <div>210 EUR</div>
            <div>27%</div>
            <div className="text-emerald-200">Add</div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function PlanningLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight text-white">Plan</h1>

      <div className="grid gap-4 xl:grid-cols-12">
        <GlassCard title="Goal Contract" className="xl:col-span-8">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3 text-lg">Start: 5 000 EUR</div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3 text-lg">Monthly: 300 EUR</div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3 text-lg">Target: 50 000 EUR</div>
            <div className="rounded-xl border border-white/20 bg-slate-900/30 p-3 text-lg">Horizon: 3y</div>
          </div>
        </GlassCard>

        <GlassCard title="Starter Pack" className="xl:col-span-4">
          <div className="space-y-2 text-lg text-slate-200">
            <p>AGGH - 45%</p>
            <p>SPY - 27%</p>
            <p>GLD - 27%</p>
          </div>
        </GlassCard>

        <GlassCard title="Gap to Target + Wealth Levers" className="xl:col-span-12">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">Base path: 18 327 EUR</div>
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">Accelerated: 19 472 EUR</div>
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">High risk optional: 20 077 EUR</div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function AutonomyLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-semibold tracking-tight text-white">Autonomy</h1>

      <div className="grid gap-4 xl:grid-cols-12">
        <GlassCard title="Autonomy Status" className="xl:col-span-6">
          <div className="text-5xl font-semibold text-amber-200">LIMITED</div>
          <p className="mt-3 text-xl text-slate-200">A autonoma esta limitada. Exposicao permitida: 10%.</p>
          <button className="mt-5 rounded-xl border border-blue-300/50 bg-blue-500/30 px-5 py-2.5 text-lg text-white">
            Enable Autopilot
          </button>
        </GlassCard>

        <GlassCard title="Risk Governance" className="xl:col-span-3">
          <div className="space-y-3 text-lg text-slate-200">
            <p>Target exposure: 10%</p>
            <p>Current exposure: 8%</p>
            <p>Kill-switch: Protecting</p>
            <p>Envelope class: Locked</p>
          </div>
        </GlassCard>

        <GlassCard title="Autopilot Strategy" className="xl:col-span-3">
          <div className="space-y-3 text-lg text-slate-200">
            <p>Alignment: DEFENSIVO</p>
            <p>Probability: 60%</p>
            <p>Path: BASE</p>
          </div>
        </GlassCard>

        <GlassCard title="Governance Loop" className="xl:col-span-12">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">1. Check risk pressure and concentration</div>
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">2. Restrict aggressive entries while protection is active</div>
            <div className="rounded-2xl border border-white/20 bg-slate-900/30 p-4 text-lg">3. Keep one clear command for today</div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function MainLayout({ tab }: { tab: PreviewTab }) {
  if (tab === "advisor") return <AdvisorLayout />;
  if (tab === "portfolio") return <PortfolioLayout />;
  if (tab === "planning") return <PlanningLayout />;
  if (tab === "autonomy") return <AutonomyLayout />;
  return <DailyLayout />;
}

export default async function StructurePreviewPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams> | PageSearchParams;
}) {
  const params =
    searchParams && typeof (searchParams as Promise<PageSearchParams>).then === "function"
      ? await (searchParams as Promise<PageSearchParams>)
      : (searchParams as PageSearchParams | undefined);

  const tabParam = params?.tab;
  const tabRaw = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const tab = asTab(tabRaw);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b1428] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(110,142,214,0.32),transparent_44%),radial-gradient(circle_at_80%_0%,rgba(90,118,189,0.28),transparent_38%),radial-gradient(circle_at_60%_90%,rgba(48,70,132,0.3),transparent_42%)]" />

      <div className="relative mx-auto max-w-[1680px] p-4 sm:p-6">
        <TopNav tab={tab} />

        <div className="mt-4 flex gap-4">
          <Sidebar tab={tab} />
          <section className="min-w-0 flex-1 rounded-2xl border border-[#7a92c8]/35 bg-[#f1f5ff]/5 p-4 backdrop-blur-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-sm text-slate-300">
              <span className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                Preview structure only. No engine wiring. No production behavior changed.
              </span>
              <span className="hidden rounded-lg border border-emerald-300/50 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200 sm:inline">
                SAFE PREVIEW
              </span>
            </div>
            <MainLayout tab={tab} />
          </section>
        </div>
      </div>
    </main>
  );
}
