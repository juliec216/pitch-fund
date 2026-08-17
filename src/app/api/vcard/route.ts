import { dedicatedLine } from "@/lib/line";
import { phoPhoVCard } from "@/lib/vcard";

export const dynamic = "force-dynamic";

/** The same card the agent sends over iMessage, for anyone who'd rather tap the site. */
export async function GET() {
  const line = dedicatedLine();
  if (!line) return new Response("line not configured", { status: 503 });

  return new Response(await phoPhoVCard(line), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pho-pho.vcf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
