import { StreamClient } from "@stream-io/node-sdk";
import { NextRequest, NextResponse } from "next/server";

const streamClient = new StreamClient(
  process.env.NEXT_PUBLIC_STREAM_API_KEY!,
  process.env.STREAM_SECRET!
);

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const token = streamClient.generateUserToken({ user_id });

    return NextResponse.json({ token });
  } catch (err) {
    console.error("Stream token error:", err);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}