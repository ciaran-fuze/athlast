import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const raceId = request.nextUrl.searchParams.get("race_id");
  const athleteId = request.nextUrl.searchParams.get("athlete_id");

  if (!raceId) {
    return NextResponse.json({ error: "Missing race_id" }, { status: 400 });
  }

  let query = supabase
    .from("supporter_messages")
    .select("*")
    .eq("race_id", raceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { race_id, athlete_id, sender_name, message, photo_url } = body;

  if (!race_id || !athlete_id || !sender_name) {
    return NextResponse.json(
      { error: "Missing required fields: race_id, athlete_id, sender_name" },
      { status: 400 }
    );
  }

  if (!message && !photo_url) {
    return NextResponse.json(
      { error: "Must provide either a message or photo" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("supporter_messages")
    .insert({
      race_id,
      athlete_id,
      sender_name,
      message: message || null,
      photo_url: photo_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
