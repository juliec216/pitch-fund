import QRCode from "qrcode";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data");
  if (!data) return new Response("missing ?data=", { status: 400 });
  if (data.length > 2048) return new Response("data too long", { status: 400 });
  const svg = await QRCode.toString(data, {
    type: "svg",
    margin: 1,
    width: 280,
    color: { dark: "#0a0a0f", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
