import DashboardClient from "@/app/dashboard-client";
import LoginClient from "@/app/login-client";
import SetupScreen from "@/app/setup-screen";
import { isAuthenticated } from "@/lib/auth";
import { getRuntimeConfigStatus } from "@/lib/config";
import { getDashboardData } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const status = getRuntimeConfigStatus();
  if (status.realMode && !status.readyForRealUse) {
    return <SetupScreen status={status} />;
  }

  if (status.realMode && !(await isAuthenticated())) {
    return <LoginClient />;
  }

  const dashboard = await getDashboardData();
  return <DashboardClient initialDashboard={dashboard} />;
}
