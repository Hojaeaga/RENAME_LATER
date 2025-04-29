import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { profile, casts } = await req.json();

    const userText = [
      `Display Name: ${profile.displayName}`,
      `Username: ${profile.username}`,
      `Bio: ${profile.bio}`,
      `Recent Casts:\n${casts
        .slice(0, 5)
        .map((c: any) => c.text)
        .join("\n")}`,
    ].join("\n\n");

    // --- 1. Summarize the user ---
    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You analyze social graph data. Summarize this user’s personality, interests, and tone. Return valid JSON: { summary, tags: string[], style }.`,
        },
        {
          role: "user",
          content: userText,
        },
      ],
      temperature: 0.7,
    });

    const parsed = summaryResponse.choices[0].message.content?.trim() || "{}";
    const { summary, tags, style } = JSON.parse(parsed);

    // --- 2. Generate Embedding for semantic search ---
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userText,
    });
    const embedding = embeddingRes.data[0].embedding;

    // --- 3. Store processed user (no casts) ---
    const { error } = await supabase.from("users").insert({
      fid: profile.fid,
      username: profile.username,
      display_name: profile.displayName,
      bio: profile.bio,
      summary,
      tags,
      style,
      embedding,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true, summary, tags, style });
  } catch (err: any) {
    console.error("Ingest Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
