import { NextResponse } from "next/server";
import { venueIndex } from "@/lib/providers";
import { UNIVERSE } from "@/lib/universe";

export async function GET() {
  const v = await venueIndex(UNIVERSE);
  return NextResponse.json({
    sessions: v.sessions,
    gainsRefreshed: v.gainsRefreshed,
    errors: v.errors,
    instruments: UNIVERSE.map((i) => ({
      id: i.id,
      name: i.name,
      cls: i.cls,
      listings: v.byInstrument.get(i.id) ?? [],
    })),
  });
}
