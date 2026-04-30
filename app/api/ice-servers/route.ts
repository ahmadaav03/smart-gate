import { NextResponse } from "next/server";

const TURN_KEY_ID = process.env.TURN_KEY_ID!;
const TURN_KEY_API_TOKEN = process.env.CLOUDFLARE_REALTIME_API_TOKEN!;

export async function GET() {
  try {
    console.log("TURN_KEY_ID:", TURN_KEY_ID);
    console.log("TURN_KEY_API_TOKEN length:", TURN_KEY_API_TOKEN?.length);
    console.log("TURN_KEY_API_TOKEN first 6 chars:", TURN_KEY_API_TOKEN?.substring(0, 6));

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TURN_KEY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    const data = await response.json();
    console.log("Cloudflare response:", JSON.stringify(data));
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch TURN credentials:", err);
    return NextResponse.json({ iceServers: [] }, { status: 500 });
  }
}