import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { exportDashboardData, getDashboardData } from "@/lib/data-store";

export async function GET(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "json" ? "json" : "csv";
  const body = exportDashboardData(format, await getDashboardData());
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mendy-boti.${format}"`,
    },
  });
}
