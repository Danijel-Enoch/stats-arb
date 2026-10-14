import { NextResponse } from "next/server";
import { health } from "@/lib/providers";

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const providers = await health(force);
  return NextResponse.json({
    providers,
    anyOk: providers.some((p) => p.ok),
    checkedAt: Date.now(),
  });
}
