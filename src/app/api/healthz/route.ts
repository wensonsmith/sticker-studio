import { getRuntimeHealth } from "@/lib/stickerize/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getRuntimeHealth();
  const healthy = health.apiKeyConfigured && health.modelDirReadable;

  return Response.json(
    {
      ok: healthy,
      checks: health,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
