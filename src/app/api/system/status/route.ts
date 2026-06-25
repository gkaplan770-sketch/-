import { NextResponse } from "next/server";
import { getRuntimeConfigStatus } from "@/lib/config";

export async function GET() {
  return NextResponse.json(getRuntimeConfigStatus());
}
