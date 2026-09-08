import * as XLSX from "xlsx";
import type { Participant } from "@/db/schema";

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(rows: string[][]): string {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return "﻿" + body; // BOM for Excel Arabic support
}

const dt = (d: Date | null | undefined) => (d ? d.toISOString() : "");

export function buildNamesCsv(list: Participant[]): string {
  const rows: string[][] = [["م", "اسم الخريج"]];
  list.forEach((p, i) => rows.push([String(i + 1), p.fullName]));
  return toCsv(rows);
}

export function buildBackupCsv(list: Participant[]): string {
  const rows: string[][] = [
    [
      "id",
      "full_name",
      "submission_type",
      "group_id",
      "display_order",
      "skipped",
      "submitted_at",
      "updated_at",
      "version",
      "grad_image_status",
      "ai_error",
      "childhood_image_url",
      "adult_image_url",
      "graduation_image_url",
    ],
  ];
  for (const p of list) {
    rows.push([
      p.id,
      p.fullName,
      p.submissionType,
      p.groupId ?? "",
      String(p.displayOrder),
      String(p.skipped),
      dt(p.submittedAt),
      dt(p.updatedAt),
      String(p.version),
      p.gradImageStatus,
      p.aiError ?? "",
      p.childhoodImageUrl ?? "",
      p.adultImageUrl ?? "",
      p.graduationImageUrl ?? "",
    ]);
  }
  return toCsv(rows);
}

export function buildNamesXlsx(list: Participant[]): Buffer {
  const data = list.map((p, i) => ({ "م": i + 1, "اسم الخريج": p.fullName }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الخريجون");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildBackupXlsx(list: Participant[]): Buffer {
  const data = list.map((p) => ({
    id: p.id,
    full_name: p.fullName,
    submission_type: p.submissionType,
    group_id: p.groupId ?? "",
    display_order: p.displayOrder,
    skipped: p.skipped,
    submitted_at: dt(p.submittedAt),
    updated_at: dt(p.updatedAt),
    version: p.version,
    grad_image_status: p.gradImageStatus,
    ai_error: p.aiError ?? "",
    childhood_image_url: p.childhoodImageUrl ?? "",
    adult_image_url: p.adultImageUrl ?? "",
    graduation_image_url: p.graduationImageUrl ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "backup");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
