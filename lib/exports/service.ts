/**
 * Admin exports.
 *
 *  - names-only CSV / XLSX : one participant name per row, in submission order
 *                            (group members stay adjacent in their group order).
 *                            NEVER contains image URLs or metadata.
 *  - full CSV / XLSX       : backup export with timestamps, group ids, type,
 *                            queue/status info (plus image URLs for restore).
 */
import ExcelJS from "exceljs";
import { listParticipantViews } from "@/db/views";
import { csvEscape, groupLabel } from "@/lib/format";

export interface ExportRow {
  fullName: string;
  submittedAtIso: string;
  groupLabel: string;
  groupId: string | null;
  submissionType: "INDIVIDUAL" | "GROUP";
  presentationOrder: number | null;
  presentationStatus: string;
  aiStatus: string;
  source: string;
  childhoodUrl: string;
  adultUrl: string;
  graduationUrl: string;
}

async function loadRows(): Promise<ExportRow[]> {
  const items = await listParticipantViews();
  // Oldest submission first; group members in their stored group order.
  items.sort((a, b) => {
    const t = a.submittedAt.getTime() - b.submittedAt.getTime();
    if (t !== 0) return t;
    return (a.groupPosition ?? 0) - (b.groupPosition ?? 0);
  });
  return items.map((i) => ({
    fullName: i.fullName,
    submittedAtIso: i.submittedAt.toISOString(),
    groupLabel: i.groupNumber != null ? groupLabel(i.groupNumber) : "Individual",
    groupId: i.groupId,
    submissionType: i.submissionType,
    presentationOrder: i.presentationOrder,
    presentationStatus: i.presentationStatus,
    aiStatus: i.aiStatus,
    source: i.source,
    childhoodUrl: i.childhoodImage?.publicUrl ?? "",
    adultUrl: i.adultImage?.publicUrl ?? "",
    graduationUrl: i.graduationImage?.publicUrl ?? "",
  }));
}

/* ---------------------------- Names only ---------------------------- */

export async function buildNamesCsv(): Promise<string> {
  const rows = await loadRows();
  return rows.map((r) => csvEscape(r.fullName)).join("\r\n") + "\r\n";
}

export async function buildFullCsv(): Promise<string> {
  const rows = await loadRows();
  const header = [
    "full_name",
    "submission_time_utc_ms",
    "submission_type",
    "group",
    "group_id",
    "presentation_order",
    "presentation_status",
    "ai_status",
    "source",
    "childhood_image_url",
    "adult_image_url",
    "graduation_image_url",
  ];
  const lines = rows.map((r) =>
    [
      csvEscape(r.fullName),
      csvEscape(r.submittedAtIso),
      csvEscape(r.submissionType),
      csvEscape(r.groupLabel),
      csvEscape(r.groupId),
      csvEscape(r.presentationOrder),
      csvEscape(r.presentationStatus),
      csvEscape(r.aiStatus),
      csvEscape(r.source),
      csvEscape(r.childhoodUrl),
      csvEscape(r.adultUrl),
      csvEscape(r.graduationUrl),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

/* ----------------------------- XLSX --------------------------------- */

async function workbookFromRows(rows: ExportRow[], namesOnly: boolean): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(namesOnly ? "Graduates" : "Graduation Party Backup");
  if (namesOnly) {
    ws.columns = [{ header: "Name", key: "name", width: 40 }];
    for (const r of rows) ws.addRow({ name: r.fullName });
  } else {
    ws.columns = [
      { header: "Full name", key: "fullName", width: 40 },
      { header: "Submission time (UTC ms)", key: "time", width: 30 },
      { header: "Submission type", key: "type", width: 14 },
      { header: "Group", key: "group", width: 14 },
      { header: "Group ID", key: "groupId", width: 40 },
      { header: "Presentation order", key: "order", width: 18 },
      { header: "Presentation status", key: "pStatus", width: 18 },
      { header: "AI status", key: "aiStatus", width: 14 },
      { header: "Source", key: "source", width: 10 },
      { header: "Childhood image URL", key: "child", width: 46 },
      { header: "Adult image URL", key: "adult", width: 46 },
      { header: "Graduation image URL", key: "grad", width: 46 },
    ];
    for (const r of rows) {
      ws.addRow({
        fullName: r.fullName,
        time: r.submittedAtIso,
        type: r.submissionType,
        group: r.groupLabel,
        groupId: r.groupId ?? "",
        order: r.presentationOrder ?? "",
        pStatus: r.presentationStatus,
        aiStatus: r.aiStatus,
        source: r.source,
        child: r.childhoodUrl,
        adult: r.adultUrl,
        grad: r.graduationUrl,
      });
    }
  }
  ws.getRow(1).font = { bold: true };
  return wb;
}

export async function buildNamesXlsx(): Promise<Buffer> {
  const wb = await workbookFromRows(await loadRows(), true);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildFullXlsx(): Promise<Buffer> {
  const wb = await workbookFromRows(await loadRows(), false);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
