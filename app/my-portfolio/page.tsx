import PlanningTab from "@/components/PlanningTab";
import PortfolioAppV1 from "@/components/PortfolioApp";
import { isPaidUser } from "@/lib/isPaidUser";

export default async function MyPortfolioPage() {
  const isPaid = await isPaidUser();

  return (
    <div>
      <PortfolioAppV1 locale="en" />
      <PlanningTab locale="en" isPaid={isPaid} />
    </div>
  );
}