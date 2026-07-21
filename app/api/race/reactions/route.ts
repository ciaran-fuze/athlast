import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const messageIds = request.nextUrl.searchParams.get("message_ids");
  const deviceId = request.nextUrl.searchParams.get("device_id");

  if (!messageIds) {
    return NextResponse.json({ error: "Missing message_ids" }, { status: 400 });
  }

  const ids = messageIds.split(",").filter(Boolean);

  // Get counts per message
  const { data: reactions, error } = await supabase
    .from("message_reactions")
    .select("message_id, device_id")
    .in("message_id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build counts and "reacted by this device" set
  const counts: Record<string, number> = {};
  const reacted: Record<string, boolean> = {};

  for (const r of reactions ?? []) {
    counts[r.message_id] = (counts[r.message_id] ?? 0) + 1;
    if (deviceId && r.device_id === deviceId) {
      reacted[r.message_id] = true;
    }
  }

  return NextResponse.json({ counts, reacted });
}

export async function POST(request: NextRequest) {
  const { message_id, device_id } = await request.json();

  if (!message_id || !device_id) {
    return NextResponse.json(
      { error: "Missing message_id or device_id" },
      { status: 400 }
    );
  }

  // Check if already reacted — toggle off
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", message_id)
    .eq("device_id", device_id)
    .eq("reaction_type", "heart")
    .single();

  if (existing) {
    await supabase.from("message_reactions").delete().eq("id", existing.id);
    return NextResponse.json({ action: "removed" });
  }

  const { error } = await supabase
    .from("message_reactions")
    .insert({ message_id, device_id, reaction_type: "heart" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action: "added" });
}
