import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppReadyAndAuthenticated } from "@/lib/api-guard";
import { importCsvData } from "@/lib/data-store";

const importSchema = z.object({
  csv: z.string().min(1),
});

export async function POST(request: Request) {
  const guard = await requireAppReadyAndAuthenticated();
  if (guard) {
    return guard;
  }

  const payload = importSchema.parse(await request.json());
  const result = await importCsvData(payload.csv);
  return NextResponse.json({ result });
}
