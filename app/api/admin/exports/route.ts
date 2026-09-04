import { requireAdmin } from "@/lib/auth/require-admin";
import { jsonError } from "@/lib/http";
import {
  buildNamesCsv,
  buildNamesXlsx,
  buildFullCsv,
  buildFullXlsx,
} from "@/lib/exports/service";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["csv-names", "xlsx-names", "csv-full", "xlsx-full"] as const;
type ExportType = (typeof TYPES)[number];

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "") as ExportType;
  if (!TYPES.includes(kind)) {
    return jsonError("Unknown export type.", 400);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "csv-names") {
    const content = await buildNamesCsv();
    return csvResponse(content, `graduates-names-${stamp}.csv`);
  }
  if (kind === "csv-full") {
    const content = await buildFullCsv();
    return csvResponse(content, `graduates-backup-${stamp}.csv`);
  }
  if (kind === "xlsx-names") {
    const buffer = await buildNamesXlsx();
    await logActivity({ action: "export_xlsx_names", adminSessionId: guard.session.id });
    return xlsxResponse(buffer, `graduates-names-${stamp}.xlsx`);
  }
  const buffer = await buildFullXlsx();
  await logActivity({ action: "export_xlsx_full", adminSessionId: guard.session.id });
  return xlsxResponse(buffer, `graduates-backup-${stamp}.xlsx`);
}

function csvResponse(content: string, filename: string) {
  return new Response("\uFEFF" + content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function xlsxResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
