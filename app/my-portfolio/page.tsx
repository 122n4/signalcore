// app/my-portfolio/page.tsx
import { redirect } from "next/navigation";

export default function MyPortfolioLegacy() {
  // Legacy route: agora o produto é por tabs.
  // Mantém link antigo vivo sem quebrar build.
  redirect("/app?tab=planning");
}