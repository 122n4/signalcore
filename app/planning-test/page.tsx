export default function PlanningTestPage() {
  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* client-only */}
      <PlanningTestClient />
    </div>
  );
}

import PlanningTestClient from "./Client";