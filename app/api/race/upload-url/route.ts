import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Signed upload URL so phones send photos and videos straight to Supabase Storage,
// skipping Vercel's 4.5 MB request body limit.
export async function POST(request: NextRequest) {
  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  const ext = (name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage.from("supporter-photos").createSignedUploadUrl(fileName);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create upload" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("supporter-photos").getPublicUrl(fileName);
  return NextResponse.json({ signedUrl: data.signedUrl, url: urlData.publicUrl });
}
