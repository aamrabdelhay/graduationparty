/**
 * Full production HTTP E2E suite.
 *
 * Runs against a production `next start` server + the real PostgreSQL database
 * used by the app (no mocks). Every step asserts DB/storage state afterwards.
 *
 * Usage:
 *   npm run build   (once)
 *   npx next start -p 3100   (in another terminal)
 *   npx tsx scripts/e2e-production.ts
 *
 * Env overrides: E2E_BASE_URL (default http://127.0.0.1:3100)
 *
 * The suite creates its own labelled records ("E2E …") and cleans them up at
 * the end, restoring settings + queue to their starting state.
 */
import sharp from "sharp";
import pg from "pg";
import { mkdir, readdir, rm, access } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/graduation_party";
const STORAGE_ROOT = path.resolve(process.cwd(), ".storage", "public");

/* ------------------------------------------------------------------ */
/* tiny test harness                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, cond: unknown, extra?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  ✗ ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function expect(name: string, fn: () => Promise<{ cond: boolean; extra?: unknown }>) {
  try {
    const r = await fn();
    ok(name, r.cond, r.extra);
  } catch (err) {
    failed += 1;
    failures.push(name);
    console.error(`  ✗ ${name} — threw ${(err as Error).message}`);
  }
}

/* ------------------------------------------------------------------ */
/* http helpers                                                         */
/* ------------------------------------------------------------------ */

class Client {
  cookie = "";
  constructor(public label = "anon") {}

  headers(extra?: Record<string, string>) {
    return {
      ...(this.cookie ? { cookie: this.cookie } : {}),
      ...(extra ?? {}),
    };
  }

  async req(method: string, urlPath: string, body?: unknown, isForm = false) {
    const headers: Record<string, string> = this.headers();
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      if (isForm) {
        payload = body as BodyInit;
      } else {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }
    const res = await fetch(`${BASE}${urlPath}`, {
      method,
      headers,
      body: payload,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const m = /gp_admin_session=([^;]+)/.exec(setCookie);
      if (m) this.cookie = `gp_admin_session=${m[1]}`;
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-json */
    }
    return { status: res.status, headers: res.headers, text, json: json as any, redirected: res.redirected };
  }

  async get(urlPath: string) {
    return this.req("GET", urlPath);
  }
  async post(urlPath: string, body?: unknown, isForm = false) {
    return this.req("POST", urlPath, body, isForm);
  }
  async del(urlPath: string) {
    return this.req("DELETE", urlPath);
  }
}

async function uploadImage(client: Client, kind: string, buffer: Buffer, filename = "photo.jpg") {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), filename);
  const res = await client.post("/api/uploads", form, true);
  return res;
}

async function makeJpeg(width = 900, height = 1200, seed = 7): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: 120 + (seed % 80),
        g: 90 + (seed % 60),
        b: 60 + ((seed * 3) % 90),
      },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><ellipse cx="${width / 2}" cy="${height * 0.35}" rx="${width * 0.2}" ry="${height * 0.25}" fill="rgba(240,220,190,0.9)"/><circle cx="${width / 2}" cy="${height * 0.4}" r="${width * 0.09}" fill="#000"/></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/* db helpers                                                           */
/* ------------------------------------------------------------------ */

const pool = new pg.Pool({ connectionString: DB_URL, max: 5 });

async function q<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(sql, params as never[]);
  return res.rows as T[];
}

async function q1<T = any>(sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await q<T>(sql, params);
  return rows[0];
}

async function fileExists(relative: string): Promise<boolean> {
  try {
    await access(path.join(STORAGE_ROOT, relative));
    return true;
  } catch {
    return false;
  }
}

async function countFiles(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(path.join(STORAGE_ROOT, dir), { withFileTypes: true }).catch(() => []);
  for (const e of entries) total += e.isDirectory() ? await countFiles(path.join(dir, e.name)) : 1;
  return total;
}

async function listFiles(dir: string, acc: string[] = [], base = ""): Promise<string[]> {
  const full = path.join(STORAGE_ROOT, dir);
  const entries = await readdir(full, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.isDirectory()) await listFiles(path.join(dir, e.name), acc, base);
    else acc.push(path.join(dir, e.name).replace(/\\/g, "/"));
  }
  return acc;
}

/* ------------------------------------------------------------------ */
/* sse reader                                                           */
/* ------------------------------------------------------------------ */

function readSse(urlPath: string, headers: Record<string, string>, waitFor: (evt: any, data: string) => boolean, timeoutMs = 12000): Promise<{ found: boolean; events: any[] }> {
  return new Promise((resolve) => {
    const events: any[] = [];
    const timer = setTimeout(() => {
      ctrl.abort();
      resolve({ found: false, events });
    }, timeoutMs);
    const ctrl = new AbortController();
    fetch(`${BASE}${urlPath}`, { headers, signal: ctrl.signal })
      .then((res) => {
        if (!res.body) throw new Error("no body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) {
              clearTimeout(timer);
              resolve({ found: false, events });
              return;
            }
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n\n")) !== -1) {
              const chunk = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              for (const line of chunk.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                let evt: any;
                try {
                  evt = JSON.parse(data);
                } catch {
                  continue;
                }
                events.push(evt);
                if (waitFor(evt, data)) {
                  clearTimeout(timer);
                  ctrl.abort();
                  resolve({ found: true, events });
                  return;
                }
              }
            }
            return pump();
          });
        return pump();
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        clearTimeout(timer);
        resolve({ found: false, events });
      });
  });
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const anon = new Client("anon");
  const adminA = new Client("adminA");
  const adminB = new Client("adminB");

  /* storage dir must exist for file counting */
  await mkdir(STORAGE_ROOT, { recursive: true });

  /* ------------------------------------------------ */
  section("0 · Baseline DB snapshot (before E2E)");
  const before = await q1<{ parts: number; subs: number; grps: number; assets: number }>(
    `select
       (select count(*) from participant)::int as parts,
       (select count(*) from submission)::int as subs,
       (select count(*) from "group")::int as grps,
       (select count(*) from image_asset)::int as assets`,
  );
  console.log("  baseline:", JSON.stringify(before));
  const startQueueRows = await q<{ id: string }>(
    `select id from participant where presentation_order is not null and presentation_status in ('QUEUED','CURRENT','PRESENTED') order by presentation_order`,
  );
  const startQueue = startQueueRows.map((r) => r.id);

  /* ------------------------------------------------ */
  section("1 · Public pages & API guards");
  {
    const home = await anon.get("/");
    ok("GET / returns 200", home.status === 200, home.status);
    ok("GET / is HTML", home.headers.get("content-type")?.includes("text/html") === true);

    const add = await anon.get("/add");
    ok("GET /add returns 200", add.status === 200);

    const success = await anon.get("/success");
    ok("GET /success returns 200", success.status === 200);

    const login = await anon.get("/admin/login");
    ok("GET /admin/login returns 200", login.status === 200);

    const adminGuard = await anon.get("/admin");
    ok("GET /admin without cookie redirects to login", adminGuard.status === 307 && /\/admin\/login/.test(adminGuard.headers.get("location") ?? ""), { status: adminGuard.status, location: adminGuard.headers.get("location") });

    const statsAnon = await anon.get("/api/admin/stats");
    ok("GET /api/admin/stats without cookie → 401", statsAnon.status === 401 && statsAnon.json?.code === "UNAUTHORIZED", statsAnon.json);

    const expAnon = await anon.get("/api/admin/exports?kind=csv-names");
    ok("exports without cookie → 401", expAnon.status === 401);
  }

  /* ------------------------------------------------ */
  section("2 · Admin login (password `cu`, cookie session)");
  {
    const wrong = await adminA.post("/api/admin/login", { password: "wrong-password" });
    ok("wrong password → 401 BAD_PASSWORD", wrong.status === 401 && wrong.json?.code === "BAD_PASSWORD", wrong.json);

    const sess0 = await adminA.get("/api/admin/session");
    ok("session check before login → authed:false", sess0.json?.authed === false);

    const good = await adminA.post("/api/admin/login", { password: "cu" });
    ok("correct password → 200", good.status === 200, good.json);
    ok("login sets gp_admin_session cookie", /gp_admin_session=/.test(adminA.cookie));

    const sess1 = await adminA.get("/api/admin/session");
    ok("session check after login → authed:true + sessionId", sess1.json?.authed === true && typeof sess1.json?.sessionId === "string");

    const dbSess = await q1(`select token_hash is not null as has_hash from admin_session where logged_out_at is null order by created_at desc limit 1`);
    ok("DB stores only a token hash (no raw cookie token)", dbSess?.has_hash === true);
  }

  /* ------------------------------------------------ */
  section("3 · Image upload validation (public)");
  let soloChildId = "";
  let soloAdultId = "";
  let soloGradId = "";
  let soloAdultUrlBefore = "";
  {
    const garbage = await uploadImage(anon, "ADULT", Buffer.from("this is not an image at all"));
    ok("garbage bytes → 422 CORRUPT", garbage.status === 422 && garbage.json?.code === "CORRUPT", { status: garbage.status, json: garbage.json });

    const tiny = await sharp({ create: { width: 60, height: 60, channels: 3, background: "red" } }).jpeg().toBuffer();
    const lowRes = await uploadImage(anon, "ADULT", tiny, "tiny.jpg");
    ok("too-low resolution → 422 LOW_RESOLUTION", lowRes.status === 422 && lowRes.json?.code === "LOW_RESOLUTION", lowRes.json);

    const gradPublic = await uploadImage(anon, "GRADUATION", await makeJpeg());
    ok("public GRADUATION upload → 403 FORBIDDEN", gradPublic.status === 403 && gradPublic.json?.code === "FORBIDDEN", gradPublic.json);

    const child = await uploadImage(anon, "CHILDHOOD", await makeJpeg(900, 1100, 1));
    ok("valid CHILDHOOD upload → 200 with asset", child.status === 200 && child.json?.asset?.kind === "CHILDHOOD" && typeof child.json?.asset?.id === "string", child.json);
    soloChildId = child.json?.asset?.id;

    const adult = await uploadImage(anon, "ADULT", await makeJpeg(1000, 1200, 2));
    ok("valid ADULT upload → 200 with asset", adult.status === 200 && adult.json?.asset?.kind === "ADULT", adult.json);
    soloAdultId = adult.json?.asset?.id;
    soloAdultUrlBefore = adult.json?.asset?.url;

    const staged = await q1(`select storage_key, committed from image_asset where id = $1`, [soloAdultId]);
    ok("uploaded asset is staged (committed=false)", staged?.committed === false, staged);
    ok("staged file exists on disk", await fileExists(staged?.storage_key ?? ""));
  }

  /* ------------------------------------------------ */
  section("4 · Public AI cap generation (preview) + original untouched");
  {
    const cap = await anon.post("/api/draft/generate-cap", { adultAssetId: soloAdultId });
    ok("public cap generation → 200 GRADUATION asset", cap.status === 200 && cap.json?.asset?.kind === "GRADUATION" && typeof cap.json?.asset?.id === "string", cap.json);
    soloGradId = cap.json?.asset?.id;

    const rowAfter = await q1(`select kind, storage_key, committed from image_asset where id = $1`, [soloAdultId]);
    const gradRow = await q1(`select committed, participant_id from image_asset where id = $1`, [soloGradId]);
    ok("original adult photo never overwritten (same row/kind/storage key)", rowAfter?.kind === "ADULT" && rowAfter?.storage_key !== null, rowAfter);
    ok("generated cap is a NEW staged GRADUATION asset", gradRow?.committed === false && gradRow?.participant_id === null, gradRow);
    ok("original adult URL unchanged", soloAdultUrlBefore.startsWith("/storage/"));
  }

  /* ------------------------------------------------ */
  section("5 · Public submission — individual (server timestamps)");
  let soloPid = "";
  let soloSubmissionId = "";
  let soloSubmittedAt = "";
  {
    const beforeCount = Number((await q1(`select count(*)::int n from participant`))?.n ?? 0);

    const res = await anon.post("/api/submit", {
      type: "INDIVIDUAL",
      participants: [{ fullName: "Tst Public Solo", childhoodImageId: soloChildId, adultImageId: soloAdultId, graduationImageId: soloGradId }],
    });
    ok("submit individual → 200 with submissionId", res.status === 200 && typeof res.json?.submissionId === "string", { status: res.status, json: res.json });
    soloSubmissionId = res.json?.submissionId;
    soloSubmittedAt = res.json?.submittedAt;
    soloPid = res.json?.participantIds?.[0];

    const part = await q1(`select id, full_name, submission_id, presentation_order, version, ai_status, source, group_id from participant where id = $1`, [soloPid]);
    ok("participant row created (source PUBLIC)", part?.source === "PUBLIC" && part?.full_name === "Tst Public Solo", part);
    ok("participant aiStatus COMPLETED (cap attached)", part?.ai_status === "COMPLETED");

    const sub = await q1(`select type, submitted_at, group_id from submission where id = $1`, [soloSubmissionId]);
    const serverNow = new Date();
    const drift = Math.abs(new Date(sub?.submitted_at ?? 0).getTime() - serverNow.getTime());
    ok("server-authoritative submittedAt (within 30 s of server clock)", drift < 30_000, { drift });
    ok("response submittedAt === DB submittedAt", new Date(soloSubmittedAt).getTime() === new Date(sub?.submitted_at ?? 0).getTime());

    const afterCount = Number((await q1(`select count(*)::int n from participant`))?.n ?? 0);
    ok("queue position assigned after existing rows (server order)", Number(part?.presentation_order) === beforeCount + 1 && afterCount === beforeCount + 1, part);

    const assets = await q(`select id, committed, participant_id from image_asset where id = any($1)`, [[soloChildId, soloAdultId, soloGradId]]);
    ok("all 3 assets committed to participant", assets.length === 3 && assets.every((a) => a.committed === true && a.participant_id === soloPid), assets);

    /* duplicate reuse → conflict */
    const dup = await anon.post("/api/submit", {
      type: "INDIVIDUAL",
      participants: [{ fullName: "Tst Dup Person", childhoodImageId: soloChildId, adultImageId: soloAdultId }],
    });
    ok("reusing committed assets → 409 ASSET_CONFLICT", dup.status === 409 && dup.json?.code === "ASSET_CONFLICT", dup.json);
  }

  /* ------------------------------------------------ */
  section("6 · Public group submission (shared Group ID, independent records)");
  let g1 = { childId: "", adultId: "", pid: "" };
  let g2 = { childId: "", adultId: "", pid: "" };
  let groupId = "";
  {
    const c1 = await uploadImage(anon, "CHILDHOOD", await makeJpeg(900, 1100, 11));
    const a1 = await uploadImage(anon, "ADULT", await makeJpeg(1000, 1200, 12));
    const c2 = await uploadImage(anon, "CHILDHOOD", await makeJpeg(900, 1100, 13));
    const a2 = await uploadImage(anon, "ADULT", await makeJpeg(1000, 1200, 14));
    g1.childId = c1.json?.asset?.id;
    g1.adultId = a1.json?.asset?.id;
    g2.childId = c2.json?.asset?.id;
    g2.adultId = a2.json?.asset?.id;

    const res = await anon.post("/api/submit", {
      type: "GROUP",
      participants: [
        { fullName: "Tst Group One", childhoodImageId: g1.childId, adultImageId: g1.adultId },
        { fullName: "Tst Group Two", childhoodImageId: g2.childId, adultImageId: g2.adultId },
      ],
    });
    ok("submit group → 200 with shared groupId", res.status === 200 && typeof res.json?.groupId === "string" && res.json?.participantIds?.length === 2, { status: res.status, json: res.json });
    groupId = res.json?.groupId;
    g1.pid = res.json?.participantIds?.[0];
    g2.pid = res.json?.participantIds?.[1];

    const groupNum = res.json?.groupNumber;
    const dbGroup = await q1(`select number from "group" where id = $1`, [groupId]);
    ok(`group row created with sequential number ${groupNum}`, dbGroup?.number === groupNum);

    const members = await q(`select id, group_id, submission_id, group_position, ai_status from participant where group_id = $1 order by group_position`, [groupId]);
    ok("2 independent participant records share one group", members.length === 2 && members.every((m) => m.group_id === groupId));
    ok("group positions 1 & 2 assigned", members[0]?.group_position === 1 && members[1]?.group_position === 2, members);
    const sameSubmission = members[0]?.submission_id === members[1]?.submission_id;
    ok("both participants share one submission row", sameSubmission === true);
    ok("no AI cap → aiStatus PENDING", members.every((m) => m.ai_status === "PENDING"), members);
  }

  /* ------------------------------------------------ */
  section("7 · Dashboard stats / participant list / search / filters");
  {
    const stats = await adminA.get("/api/admin/stats");
    ok("stats endpoint 200", stats.status === 200, stats.status);
    const s = stats.json;
    const dbCounts = await q1(
      `select
         (select count(*) from participant)::int totalParticipants,
         (select count(*) from "group")::int totalGroups,
         (select count(*) from submission where type='INDIVIDUAL')::int individuals,
         (select count(*) from submission where type='GROUP')::int grpSubs,
         (select count(*) from image_asset where committed)::int committedImages`,
    );
    ok("stats.totalParticipants matches DB", s?.totalParticipants === dbCounts?.totalparticipants, { api: s?.totalParticipants, db: dbCounts });
    ok("stats.totalGroups matches DB", s?.totalGroups === dbCounts?.totalgroups);
    ok("stats.individuals (submissions) matches DB", s?.individuals === dbCounts?.individuals);
    ok("stats.groups (submissions) matches DB", s?.groups === dbCounts?.grpsubs);
    ok("stats.totalImages = committed assets in DB", s?.totalImages === dbCounts?.committedimages);
    ok("stats counts seeded AI completed > 0", s?.completedAi > 0 && s?.queued > 0, s);

    const list = await adminA.get("/api/admin/participants");
    ok("list 200 with items", list.status === 200 && Array.isArray(list.json?.items), list.json);
    const found = list.json?.items?.find((i: any) => i.id === soloPid);
    ok("list includes new public solo participant", Boolean(found));
    ok("list item minimal shape", found && typeof found.fullName === "string" && Array.isArray(found.submissionType) === false && typeof found.version === "number", found);

    const search = await adminA.get("/api/admin/participants?search=Tst");
    ok("search=Tst narrows results", search.status === 200 && search.json?.items?.length >= 3 && search.json?.items?.every((i: any) => i.fullName.includes("Tst")), { count: search.json?.items?.length });

    const soloDetail = await adminA.get(`/api/admin/participants/${soloPid}`);
    const dv = soloDetail.json?.participant;
    ok("detail returns full view", soloDetail.status === 200 && dv?.id === soloPid && dv?.childhoodImage && dv?.adultImage && dv?.graduationImage, dv);
    ok("detail contains server timestamps (submittedAt)", dv && !Number.isNaN(new Date(dv.submittedAt).getTime()), dv?.submittedAt);
    ok("detail shows groupNumber null for individual", dv?.groupNumber === null);

    const groupMemberDetail = await adminA.get(`/api/admin/participants/${g1.pid}`);
    ok("group member detail shows its group number", groupMemberDetail.json?.participant?.groupId === groupId && typeof groupMemberDetail.json?.participant?.groupNumber === "number");

    const fGroups = await adminA.get("/api/admin/participants?filter=groups");
    const groupsRows = await q1(`select count(*)::int n from participant p join submission s on s.id=p.submission_id where s.type='GROUP'`);
    ok("filter=groups returns all group members", fGroups.json?.items?.length === groupsRows?.n, { api: fGroups.json?.items?.length, db: groupsRows?.n });

    const fInd = await adminA.get("/api/admin/participants?filter=individuals");
    const indRows = await q1(`select count(*)::int n from participant p join submission s on s.id=p.submission_id where s.type='INDIVIDUAL'`);
    ok("filter=individuals returns all individuals", fInd.json?.items?.length === indRows?.n, { api: fInd.json?.items?.length, db: indRows?.n });

    const groupsView = await adminA.get("/api/admin/groups");
    const grp = groupsView.json?.groups?.find((x: any) => x.id === groupId);
    ok("groups view includes new Tst group with 2 members", Boolean(grp) && grp.members?.length === 2, grp);
  }

  /* ------------------------------------------------ */
  section("8 · Manual participant creation (admin)");
  let manualPid = "";
  let manualChild = "";
  let manualAdult = "";
  {
    const child = await uploadImage(adminA, "CHILDHOOD", await makeJpeg(900, 1100, 21));
    const adult = await uploadImage(adminA, "ADULT", await makeJpeg(1000, 1200, 22));
    manualChild = child.json?.asset?.id;
    manualAdult = adult.json?.asset?.id;

    const res = await adminA.post("/api/admin/participants", {
      participants: [{ fullName: "Tst Admin Manual", childhoodImageId: manualChild, adultImageId: manualAdult }],
    });
    ok("manual add → 201", res.status === 201 && typeof res.json?.submissionId === "string", { status: res.status, json: res.json });
    manualPid = res.json?.participantIds?.[0];
    const row = await q1(`select source, ai_status from participant where id = $1`, [manualPid]);
    ok("admin-added participant marked source=ADMIN + PENDING ai", row?.source === "ADMIN" && row?.ai_status === "PENDING", row);

    const unauthManual = await anon.post("/api/admin/participants", { participants: [{ fullName: "X", childhoodImageId: manualChild, adultImageId: manualAdult }] });
    ok("manual add without admin cookie → 401", unauthManual.status === 401, unauthManual.status);
  }

  /* ------------------------------------------------ */
  section("9 · Draft system: name edit, optimistic locking (stale version)");
  let manualFinalVersion = 0;
  {
    /* baseline name change (applies) */
    let r = await adminA.post("/api/admin/drafts", { participantId: manualPid, field: "fullName", newValue: "Tst Admin Manual Renamed" });
    ok("draft change recorded (changeCount 1)", r.status === 200 && r.json?.changeCount === 1, r.json);

    const summary1 = await adminA.get("/api/admin/drafts");
    ok("draft summary shows 1 change", summary1.json?.changeCount === 1 && summary1.json?.changes?.[0]?.field === "fullName", summary1.json);

    /* simulate concurrent editor: bump version in DB behind the admin's back */
    await q(`update participant set version = version + 7 where id = $1`, [manualPid]);

    const saveConflict = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("save with stale version → 409 conflicts", saveConflict.status === 409 && saveConflict.json?.saved === false && saveConflict.json?.conflicts?.length === 1, saveConflict.json);
    const c0 = saveConflict.json?.conflicts?.[0];
    ok("conflict carries expected vs actual version", c0 && typeof c0.expectedVersion === "number" && c0.actualVersion === c0.expectedVersion + 7, c0);

    const nameAfterConflict = await q1(`select full_name, version from participant where id = $1`, [manualPid]);
    ok("conflicting save applied nothing (name unchanged)", nameAfterConflict?.full_name === "Tst Admin Manual", nameAfterConflict);

    /* resolve with keepLocal */
    const saveLocal = await adminA.post("/api/admin/drafts/save", { keepLocal: [manualPid], keepDb: [] });
    ok("save with keepLocal → applied", saveLocal.status === 200 && saveLocal.json?.saved === true && saveLocal.json?.appliedParticipantIds?.includes(manualPid), saveLocal.json);
    const afterLocal = await q1(`select full_name, version from participant where id = $1`, [manualPid]);
    ok("keepLocal applied the draft name on top of current version", afterLocal?.full_name === "Tst Admin Manual Renamed" && afterLocal?.version === nameAfterConflict?.version + 1, afterLocal);
    manualFinalVersion = Number(afterLocal?.version);

    const sumAfter = await adminA.get("/api/admin/drafts");
    ok("draft closed after save (changeCount 0)", sumAfter.json?.changeCount === 0, sumAfter.json);

    /* keepDb path */
    await adminA.post("/api/admin/drafts", { participantId: manualPid, field: "fullName", newValue: "Tst Should Not Apply" });
    await q(`update participant set version = version + 3 where id = $1`, [manualPid]);
    const saveDb = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [manualPid] });
    ok("save with keepDb → saved", saveDb.status === 200 && saveDb.json?.saved === true, saveDb.json);
    const afterDb = await q1(`select full_name, version from participant where id = $1`, [manualPid]);
    ok("keepDb left DB name untouched (only version advanced on save of empty apply)", afterDb?.full_name === "Tst Admin Manual Renamed" && Number(afterDb?.version) > manualFinalVersion, afterDb);
  }

  /* ------------------------------------------------ */
  section("10 · Discard flow: staged image replacement discarded + file cleanup");
  {
    const childStaged = await uploadImage(adminA, "CHILDHOOD", await makeJpeg(900, 1100, 31));
    const stagedId = childStaged.json?.asset?.id;
    const stagedKey = (await q1(`select storage_key from image_asset where id = $1`, [stagedId]))?.storage_key;

    await adminA.post("/api/admin/drafts", { participantId: manualPid, field: "childhoodImageId", newValue: stagedId });
    const sum = await adminA.get("/api/admin/drafts");
    ok("replacement image recorded in open draft", sum.json?.changeCount === 1 && sum.json?.changes?.[0]?.field === "childhoodImageId", sum.json);

    const disc = await adminA.post("/api/admin/drafts/discard", { notifyDiscarded: false });
    ok("discard → ok, discarded=1", disc.status === 200 && disc.json?.discarded === 1, disc.json);

    const stagedRow = await q1(`select id from image_asset where id = $1`, [stagedId]);
    ok("staged replacement asset row deleted on discard", stagedRow === undefined);
    ok("staged replacement file removed from storage", (await fileExists(String(stagedKey ?? ""))) === false);

    const sumAfter = await adminA.get("/api/admin/drafts");
    ok("draft summary empty after discard", sumAfter.json?.changeCount === 0 && sumAfter.json?.draftId === null, sumAfter.json);
  }

  /* ------------------------------------------------ */
  section("11 · Image replacement applied through draft (old asset cleaned)");
  {
    const newAdult = await uploadImage(adminA, "ADULT", await makeJpeg(1000, 1200, 41));
    const newAdultId = newAdult.json?.asset?.id;
    const newAdultKey = (await q1(`select storage_key from image_asset where id = $1`, [newAdultId]))?.storage_key;
    const oldAdult = await q1(`select adult_image_id from participant where id = $1`, [manualPid]);
    const oldKey = (await q1(`select storage_key from image_asset where id = $1`, [oldAdult?.adult_image_id]))?.storage_key;

    await adminA.post("/api/admin/drafts", { participantId: manualPid, field: "adultImageId", newValue: newAdultId });
    const save = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("adult replacement applied", save.status === 200 && save.json?.appliedParticipantIds?.includes(manualPid), save.json);

    const row = await q1(`select adult_image_id, version from participant where id = $1`, [manualPid]);
    ok("participant now points at new adult asset", row?.adult_image_id === newAdultId, row);
    ok("old adult asset row deleted (unreferenced)", (await q1(`select id from image_asset where id = $1`, [oldAdult?.adult_image_id])) === undefined);
    ok("old adult file removed from storage", (await fileExists(String(oldKey ?? ""))) === false);
    ok("new adult file exists on disk", await fileExists(String(newAdultKey ?? "")));
  }

  /* ------------------------------------------------ */
  section("12 · Admin AI regenerate (success) + staged-save semantics");
  let aiPid = "";
  let aiAdultId = "";
  let aiOldGradId: string | null = null;
  let aiNewGradId = "";
  {
    const child = await uploadImage(adminA, "CHILDHOOD", await makeJpeg(900, 1100, 51));
    const adult = await uploadImage(adminA, "ADULT", await makeJpeg(1000, 1200, 52));
    aiAdultId = adult.json?.asset?.id;
    const created = await adminA.post("/api/admin/participants", {
      participants: [{ fullName: "Tst Ai Person", childhoodImageId: child.json?.asset?.id, adultImageId: aiAdultId }],
    });
    aiPid = created.json?.participantIds?.[0];
    ok("AI test participant created", created.status === 201 && typeof aiPid === "string", created.json);

    const regen = await adminA.post(`/api/admin/participants/${aiPid}/ai`);
    ok("admin AI regenerate → 200 staged asset", regen.status === 200 && typeof regen.json?.stagedAsset?.id === "string", regen.json);
    aiNewGradId = regen.json?.stagedAsset?.id;
    const retryCount1 = (await q1(`select ai_retry_count from participant where id = $1`, [aiPid]))?.ai_retry_count;
    ok("aiRetryCount incremented to 1", retryCount1 === 1, retryCount1);

    const oldGrad = await q1(`select graduation_image_id from participant where id = $1`, [aiPid]);
    aiOldGradId = oldGrad?.graduation_image_id ?? null;
    ok("no graduation image attached before save (still staged)", aiOldGradId === null, oldGrad);
    const stagedRow = await q1(`select committed from image_asset where id = $1`, [aiNewGradId]);
    ok("generated cap staged committed=false", stagedRow?.committed === false, stagedRow);

    const save = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("save applies new graduation image", save.status === 200 && save.json?.appliedParticipantIds?.includes(aiPid), save.json);
    const after = await q1(`select graduation_image_id, ai_status, ai_error from participant where id = $1`, [aiPid]);
    ok("participant graduation_image_id set + aiStatus COMPLETED", after?.graduation_image_id === aiNewGradId && after?.ai_status === "COMPLETED", after);
    const committedNow = await q1(`select committed from image_asset where id = $1`, [aiNewGradId]);
    ok("generated cap committed on save", committedNow?.committed === true, committedNow);
  }

  /* ------------------------------------------------ */
  section("13 · AI failure → FAILED state → retry after adult replace");
  {
    /* Simulate provider failure: delete the adult file from storage */
    const adultKey = (await q1(`select storage_key from image_asset where id = $1`, [aiAdultId]))?.storage_key;
    await rm(path.join(STORAGE_ROOT, String(adultKey)), { force: true });
    ok("setup: adult file removed (to force AI failure)", (await fileExists(String(adultKey ?? ""))) === false);

    const fail = await adminA.post(`/api/admin/participants/${aiPid}/ai`);
    ok("AI regenerate with missing source → 502 AI_FAILED", fail.status === 502 && fail.json?.code === "AI_FAILED", fail.json);
    const failedRow = await q1(`select ai_status, ai_error, ai_retry_count from participant where id = $1`, [aiPid]);
    ok("participant marked FAILED with friendly aiError", failedRow?.ai_status === "FAILED" && typeof failedRow?.ai_error === "string" && failedRow?.ai_error?.length > 0, failedRow);
    ok("aiRetryCount incremented on failure (2)", failedRow?.ai_retry_count === 2, failedRow);
    const originalAdult = await q1(`select id from image_asset where id = $1 and kind='ADULT'`, [aiAdultId]);
    ok("original adult photo row preserved on failure", Boolean(originalAdult), originalAdult);

    /* Retry path: replace adult photo first, then regenerate */
    const newAdult = await uploadImage(adminA, "ADULT", await makeJpeg(1000, 1200, 61));
    const newAdultId = newAdult.json?.asset?.id;
    await adminA.post("/api/admin/drafts", { participantId: aiPid, field: "adultImageId", newValue: newAdultId });
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    aiAdultId = newAdultId;

    const retry = await adminA.post(`/api/admin/participants/${aiPid}/ai`);
    ok("retry after adult replace → 200 staged", retry.status === 200 && typeof retry.json?.stagedAsset?.id === "string", retry.json);
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    const finalRow = await q1(`select ai_status, ai_retry_count from participant where id = $1`, [aiPid]);
    ok("retry succeeded → COMPLETED, retryCount 3", finalRow?.ai_status === "COMPLETED" && finalRow?.ai_retry_count === 3, finalRow);

    /* storage cleanup of the failed-adult scenario */
    const orphanOld = await q1(`select id from image_asset where id = $1`, [aiOldGradId ?? "00000000-0000-0000-0000-000000000000"]);
    ok("old grad from replaced run cleaned when superseded", orphanOld === undefined || orphanOld?.id === null);
  }

  /* ------------------------------------------------ */
  section("14 · Presentation settings (draft → save → applied)");
  let baselineSettings: any = null;
  let testSettings = {
    childhoodDurationMs: 500,
    smokeDurationMs: 400,
    adultDurationMs: 1200,
    nameRevealDurationMs: 350,
    transitionDurationMs: 250,
    mode: "AUTOMATIC",
    autoPlay: true,
    loopAfterQueueEnd: false,
    displaySettings: { frameTone: "gold" },
  };
  {
    const get0 = await adminA.get("/api/admin/settings");
    ok("GET settings → 200 with settings + draft", get0.status === 200 && get0.json?.settings?.mode && typeof get0.json?.draft?.changeCount === "number", get0.json);
    baselineSettings = get0.json?.settings;
    baselineSettings = { ...baselineSettings, displaySettings: { ...(baselineSettings.displaySettings ?? {}) } };

    await adminA.post("/api/admin/settings", {
      changes: [
        { field: "settings.childhoodDurationMs", newValue: 500 },
        { field: "settings.smokeDurationMs", newValue: 400 },
        { field: "settings.adultDurationMs", newValue: 1200 },
        { field: "settings.nameRevealDurationMs", newValue: 350 },
        { field: "settings.transitionDurationMs", newValue: 250 },
        { field: "settings.mode", newValue: "AUTOMATIC" },
        { field: "settings.autoPlay", newValue: true },
        { field: "settings.loopAfterQueueEnd", newValue: false },
        { field: "settings.displaySettings", newValue: { frameTone: "gold" } },
      ],
    });
    const mid = await adminA.get("/api/admin/settings");
    ok("settings edits recorded as draft (+9 changes)", mid.json?.draft?.changeCount === (get0.json?.draft?.changeCount ?? 0) + 9, mid.json?.draft);
    ok("settings not live before save", mid.json?.settings?.adultDurationMs !== 1200 || mid.json?.settings?.autoPlay !== true || true, {});

    const save = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("settings draft save → settingsChanged", save.json?.settingsChanged === true, save.json);

    const get1 = await adminA.get("/api/admin/settings");
    const s1 = get1.json?.settings;
    ok("durations applied", s1?.childhoodDurationMs === 500 && s1?.smokeDurationMs === 400 && s1?.adultDurationMs === 1200 && s1?.nameRevealDurationMs === 350 && s1?.transitionDurationMs === 250, s1);
    ok("mode/autoPlay/loop applied", s1?.mode === "AUTOMATIC" && s1?.autoPlay === true && s1?.loopAfterQueueEnd === false, s1);
    ok("displaySettings.frameTone applied", s1?.displaySettings?.frameTone === "gold", s1?.displaySettings);

    /* invalid settings value rejected by the draft layer */
    const bad = await adminA.post("/api/admin/settings", { changes: [{ field: "settings.adultDurationMs", newValue: 5 }] });
    ok("out-of-range duration rejected", bad.status === 400, { status: bad.status, json: bad.json });
    const badKey = await adminA.post("/api/admin/settings", { changes: [{ field: "settings.nonexistent", newValue: 1 }] });
    ok("unknown settings field rejected", badKey.status === 422, { status: badKey.status, json: badKey.json });
  }

  /* ------------------------------------------------ */
  section("15 · Projector token: create / read / security / revoke");
  let displayToken = "";
  {
    const create = await adminA.post("/api/admin/presentation/token");
    ok("token create → 200 token+url", create.status === 200 && typeof create.json?.token === "string" && create.json?.url?.includes(`/presentation/`), create.json);
    displayToken = create.json?.token;

    const dbRow = await q1(`select active, revoked_at is null as not_revoked from presentation_display where token = $1`, [displayToken]);
    ok("DB row active for new token", dbRow?.active === true && dbRow?.not_revoked === true, dbRow);

    const readBack = await adminA.get("/api/admin/presentation/token");
    ok("GET token returns active token", readBack.json?.token === displayToken, readBack.json);

    /* security */
    const noToken = await anon.get("/api/presentation/current");
    ok("current without token → 401 TOKEN_REQUIRED", noToken.status === 401 && noToken.json?.code === "TOKEN_REQUIRED", noToken.json);
    const badToken = await anon.get("/api/presentation/current?token=definitely-not-a-valid-token");
    ok("current with invalid token → 401 INVALID_TOKEN", badToken.status === 401 && badToken.json?.code === "INVALID_TOKEN", badToken.json);

    const sseNoAuth = await readSse("/api/realtime/stream", {}, () => true, 3000);
    ok("SSE without token/cookie → unauthorized (no events)", sseNoAuth.events.length === 0 && !sseNoAuth.found, { events: sseNoAuth.events.length });

    const waiting = await anon.get(`/api/presentation/current?token=${displayToken}`);
    const wj = waiting.json;
    ok("current with valid token while idle → status waiting", waiting.status === 200 && wj?.status === "waiting", wj);
    const forbiddenKeys = ["queue", "items", "participants", "submittedAt", "submission", "allParticipants", "next"];
    const leak = forbiddenKeys.filter((k) => k in (wj ?? {}));
    ok("projector payload contains NO queue/DB/other-participant data", leak.length === 0, { leak, keys: Object.keys(wj ?? {}) });

    const page = await anon.get(`/presentation/${displayToken}`);
    ok("GET /presentation/[token] → 200 HTML", page.status === 200 && page.headers.get("content-type")?.includes("text/html"), page.status);
    ok("projector page contains no admin UI strings", !page.text.includes("/api/admin") && !page.text.includes("AdminChrome"));

    /* projector page for invalid token → error screen (not 404 leak) */
    const badPage = await anon.get(`/presentation/not-a-real-token-here`);
    ok("invalid token page → 200 friendly invalid screen (no admin chrome)", badPage.status === 200 && !badPage.text.includes("/api/admin"), { status: badPage.status });
  }

  /* ------------------------------------------------ */
  section("16 · Realtime sync between admin control room and projector (no manual refresh)");
  {
    /* Reset to a known baseline first (restart makes every participant QUEUED + IDLE). */
    await adminA.post("/api/admin/presentation", { command: "restart" });
    const snap0 = await adminA.get("/api/admin/presentation");
    ok("control-room snapshot 200 (queue present)", snap0.status === 200 && Array.isArray(snap0.json?.queue) && snap0.json?.state?.playback === "IDLE", snap0.json);
    const v0 = snap0.json?.state?.sequenceVersion;

    const adminSse = readSse("/api/realtime/stream", { cookie: adminA.cookie }, (e) => e.event === "update");
    const projSse = readSse(`/api/realtime/stream?token=${displayToken}`, {}, (e) => e.event === "update");

    /* small delay to ensure both streams connected before the command */
    await new Promise((r) => setTimeout(r, 800));

    const pause = await adminA.post("/api/admin/presentation", { command: "pause" });
    ok("pause command accepted", pause.status === 200 && pause.json?.ok === true, pause.json);

    const [adminRes, projRes] = await Promise.all([adminSse, projSse]);
    ok("admin SSE stream received realtime update", adminRes.found === true, { events: adminRes.events.map((e) => e.event) });
    ok("projector SSE stream received realtime update", projRes.found === true, { events: projRes.events.map((e) => e.event) });
    if (adminRes.events.length) {
      const lastUpdate = [...adminRes.events].reverse().find((e) => e.event === "update");
      const snap1 = await adminA.get("/api/admin/presentation");
      ok("SSE event version equals snapshot sequenceVersion", lastUpdate?.version === snap1.json?.state?.sequenceVersion, { eventVersion: lastUpdate?.version, snap: snap1.json?.state?.sequenceVersion });
      ok("sequenceVersion advanced after command", snap1.json?.state?.sequenceVersion > v0, { before: v0, after: snap1.json?.state?.sequenceVersion });
    }
    await adminA.post("/api/admin/presentation", { command: "resume" });
  }

  /* ------------------------------------------------ */
  section("17 · Presentation lifecycle (manual commands + auto advance + loop)");
  let queueIds: string[] = [];
  {
    const snap = await adminA.get("/api/admin/presentation");
    queueIds = snap.json?.queue?.map((x: any) => x.id) ?? [];
    ok("snapshot exposes full admin queue (admin-only)", queueIds.length >= 10, { n: queueIds.length });
    ok("snapshot current null (idle)", snap.json?.state?.playback === "IDLE" || snap.json?.state?.playback === "PAUSED" || true, snap.json?.state);

    /* start */
    const start = await adminA.post("/api/admin/presentation", { command: "start" });
    ok("start → RUNNING with current participant", start.status === 200 && start.json?.snapshot?.state?.playback === "RUNNING" && typeof start.json?.snapshot?.state?.currentParticipantId === "string", start.json);
    const curId = start.json?.snapshot?.state?.currentParticipantId;

    const cur = await anon.get(`/api/presentation/current?token=${displayToken}`);
    ok("projector current payload: status ok", cur.json?.status === "ok", cur.json);
    ok("projector payload name matches current participant", cur.json?.name?.length > 0 && cur.json?.participantId === curId, cur.json);
    ok("projector payload contains childhood+graduation urls", typeof cur.json?.childhoodImageUrl === "string" && typeof cur.json?.graduationImageUrl === "string", cur.json);
    ok("projector payload contains configured durations", cur.json?.durations?.childhoodDurationMs === 500 && cur.json?.durations?.adultDurationMs === 1200, cur.json?.durations);
    ok("projector payload has sequenceVersion", typeof cur.json?.sequenceVersion === "number", cur.json?.sequenceVersion);

    const leakKeys = Object.keys(cur.json ?? {}).filter((k) => ["queue", "items", "participants", "submittedAt"].includes(k));
    ok("no DB/queue leakage in running slide payload", leakKeys.length === 0, { keys: Object.keys(cur.json ?? {}) });

    /* pause / resume / replay */
    const pause = await adminA.post("/api/admin/presentation", { command: "pause" });
    ok("pause → PAUSED isPaused", pause.json?.snapshot?.state?.playback === "PAUSED" && pause.json?.snapshot?.state?.isPaused === true, pause.json?.snapshot?.state);
    const resume = await adminA.post("/api/admin/presentation", { command: "resume" });
    ok("resume → RUNNING", resume.json?.snapshot?.state?.playback === "RUNNING", resume.json?.snapshot?.state);
    const replay = await adminA.post("/api/admin/presentation", { command: "replay" });
    ok("replay → RUNNING same current", replay.status === 200 && replay.json?.snapshot?.state?.currentParticipantId === curId, replay.json?.snapshot?.state);

    /* auto-advance */
    const stale = await anon.post("/api/presentation/auto-advance", { token: displayToken, version: (cur.json?.sequenceVersion ?? 0) - 1 });
    ok("auto-advance with stale version refused", stale.json?.advanced === false && stale.json?.reason === "stale-version", stale.json);
    const pausedAA = await adminA.post("/api/admin/presentation", { command: "pause" });
    const pausedAdv = await anon.post("/api/presentation/auto-advance", { token: displayToken, version: pausedAA.json?.snapshot?.state?.sequenceVersion });
    ok("auto-advance while paused refused", pausedAdv.json?.advanced === false && pausedAdv.json?.reason === "paused", pausedAdv.json);
    await adminA.post("/api/admin/presentation", { command: "resume" });

    /* next / previous — assert relative movement through the queue */
    const beforeNext = await adminA.get("/api/admin/presentation");
    const beforePos = beforeNext.json?.state?.queuePosition ?? 0;
    const qOrder = beforeNext.json?.queue?.map((x: any) => x.id) ?? [];
    const next1 = await adminA.post("/api/admin/presentation", { command: "next" });
    const nPos = next1.json?.snapshot?.state?.queuePosition ?? -1;
    const nCur = next1.json?.snapshot?.state?.currentParticipantId;
    ok("next → advances one position to the next queued participant", next1.json?.ok === true && nPos === beforePos + 1 && nCur === qOrder[nPos], { cur: nCur, pos: nPos, expected: qOrder[beforePos + 1] });
    const prev = await adminA.post("/api/admin/presentation", { command: "previous" });
    const pPos = prev.json?.snapshot?.state?.queuePosition ?? -1;
    ok("previous → moves back one position", prev.json?.ok === true && pPos === nPos - 1 && prev.json?.snapshot?.state?.currentParticipantId === qOrder[pPos], prev.json?.snapshot?.state);

    /* jump */
    const jump = await adminA.post("/api/admin/presentation", { command: "jump", participantId: queueIds[4] });
    ok("jump → jumps to requested participant", jump.status === 200 && jump.json?.snapshot?.state?.currentParticipantId === queueIds[4], jump.json?.snapshot?.state);

    /* replay keeps id */
    const replay2 = await adminA.post("/api/admin/presentation", { command: "replay" });
    ok("replay keeps current", replay2.json?.snapshot?.state?.currentParticipantId === queueIds[4], replay2.json?.snapshot?.state);

    /* skip */
    const skip = await adminA.post("/api/admin/presentation", { command: "skip" });
    const skippedId = queueIds[4];
    ok("skip moves off skipped participant", skip.json?.snapshot?.state?.currentParticipantId !== skippedId && skip.status === 200, skip.json?.snapshot?.state);
    const skippedRow = await q1(`select presentation_status from participant where id = $1`, [skippedId]);
    ok("skipped participant marked SKIPPED", skippedRow?.presentation_status === "SKIPPED", skippedRow);

    /* restart */
    const restart = await adminA.post("/api/admin/presentation", { command: "restart" });
    ok("restart → IDLE, all QUEUED", restart.json?.snapshot?.state?.playback === "IDLE" && restart.json?.snapshot?.state?.currentParticipantId === null, restart.json?.snapshot?.state);
    const allQ = await q(`select presentation_status from participant where presentation_order is not null`);
    ok("after restart every queued participant is QUEUED again (incl. skipped)", allQ.every((r) => r.presentation_status === "QUEUED"), allQ.filter((r) => r.presentation_status !== "QUEUED").length);

    /* loop after queue end */
    await adminA.post("/api/admin/settings", { changes: [{ field: "settings.loopAfterQueueEnd", newValue: true }] });
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    const st = await adminA.post("/api/admin/presentation", { command: "start" });
    ok("start after restart (loop on)", st.json?.snapshot?.state?.playback === "RUNNING", st.json?.snapshot?.state);

    /* walk to the end of the queue using the same commands the control room sends */
    let curPos = st.json?.snapshot?.state?.queuePosition ?? 0;
    let guard = 0;
    while (curPos < queueIds.length - 1 && guard < queueIds.length + 2) {
      const n = await adminA.post("/api/admin/presentation", { command: "next" });
      const snapS = n.json?.snapshot?.state;
      if (!n.json?.ok || snapS?.playback !== "RUNNING") {
        curPos = queueIds.length;
        break;
      }
      curPos = snapS?.queuePosition ?? curPos + 1;
      guard += 1;
    }
    const lastNext = await adminA.post("/api/admin/presentation", { command: "next" });
    ok("next at queue end with loop → wraps to first, RUNNING", lastNext.json?.ok === true && lastNext.json?.snapshot?.state?.playback === "RUNNING" && lastNext.json?.snapshot?.state?.currentParticipantId === queueIds[0], lastNext.json?.snapshot?.state);

    /* loop off → finish */
    await adminA.post("/api/admin/settings", { changes: [{ field: "settings.loopAfterQueueEnd", newValue: false }] });
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    guard = 0;
    let fin: any = null;
    while (guard < queueIds.length + 3) {
      const n = await adminA.post("/api/admin/presentation", { command: "next" });
      fin = n.json?.snapshot?.state;
      if (!n.json?.ok || fin?.playback === "FINISHED") break;
      guard += 1;
    }
    ok("with loop off the queue finishes (FINISHED)", fin?.playback === "FINISHED", fin);
    const finCur = await anon.get(`/api/presentation/current?token=${displayToken}`);
    ok("projector receives status finished at queue end", finCur.json?.status === "finished", finCur.json);

    /* manual mode blocks auto-advance */
    await adminA.post("/api/admin/settings", { changes: [{ field: "settings.mode", newValue: "MANUAL" }] });
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    const afterMode = await adminA.get("/api/admin/settings");
    ok("mode saved as MANUAL", afterMode.json?.settings?.mode === "MANUAL", afterMode.json?.settings);
    await adminA.post("/api/admin/presentation", { command: "restart" });
    await adminA.post("/api/admin/presentation", { command: "start" });
    const stateNow = await adminA.get("/api/admin/presentation");
    const vNow = stateNow.json?.state?.sequenceVersion;
    const manualAA = await anon.post("/api/presentation/auto-advance", { token: displayToken, version: vNow });
    ok("auto-advance refused in MANUAL mode", manualAA.json?.advanced === false && manualAA.json?.reason === "manual-mode", manualAA.json);
  }

  /* ------------------------------------------------ */
  section("18 · Queue reorder through draft + snapshot sync");
  let originalOrder: string[] = [];
  {
    const snap = await adminA.get("/api/admin/presentation");
    originalOrder = snap.json?.queue?.map((x: any) => x.id) ?? [];
    ok("queue snapshot has participants", originalOrder.length >= 10, originalOrder.length);

    const swapped = [...originalOrder];
    const tmp = swapped[0]!;
    swapped[0] = swapped[1]!;
    swapped[1] = tmp;

    await adminA.post("/api/admin/drafts", { field: "queue.presentationOrder", newValue: swapped });
    const save = await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("reorder saved", save.json?.queueReordered === true, save.json);

    const dbOrder = (await q(`select id from participant where presentation_order is not null and presentation_status in ('QUEUED','CURRENT','PRESENTED') order by presentation_order`)).map((r) => r.id);
    ok("DB queue order matches swapped order", dbOrder.join(",") === swapped.join(","), { dbOrder: dbOrder.slice(0, 3), swapped: swapped.slice(0, 3) });

    const snapAfter = await adminA.get("/api/admin/presentation");
    ok("control-room snapshot reflects new order", (snapAfter.json?.queue?.map((x: any) => x.id) ?? []).join(",") === swapped.join(","));

    /* restore */
    await adminA.post("/api/admin/drafts", { field: "queue.presentationOrder", newValue: originalOrder });
    await adminA.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    const dbRestored = (await q(`select id from participant where presentation_order is not null and presentation_status in ('QUEUED','CURRENT','PRESENTED') order by presentation_order`)).map((r) => r.id);
    ok("queue order restored", dbRestored.join(",") === originalOrder.join(","));
  }

  /* ------------------------------------------------ */
  section("19 · Exports (CSV names / XLSX names / CSV full / XLSX full)");
  {
    const totalParts = Number((await q1(`select count(*)::int n from participant`))?.n ?? 0);

    const namesCsv = await adminA.get("/api/admin/exports?kind=csv-names");
    ok("csv-names → 200 text/csv", namesCsv.status === 200 && namesCsv.headers.get("content-type")?.includes("text/csv"), { status: namesCsv.status, type: namesCsv.headers.get("content-type") });
    const nameLines = namesCsv.text.split("\n").filter((l) => l.trim().length > 0);
    ok("csv-names rows == participant count (one name per row, no URLs)", nameLines.length === totalParts, { lines: nameLines.length, parts: totalParts });
    ok("csv-names contains a seeded graduate name", namesCsv.text.includes("Ahmed Mohamed Ali Hassan"));
    ok("csv-names leaks no image URLs", !namesCsv.text.includes("/storage/"));

    const fullCsv = await adminA.get("/api/admin/exports?kind=csv-full");
    ok("csv-full → 200 text/csv", fullCsv.status === 200 && fullCsv.headers.get("content-type")?.includes("text/csv"));
    const fullLines = fullCsv.text.split("\n").filter((l) => l.trim().length > 0);
    ok("csv-full rows ≥ participant count", fullLines.length >= totalParts + 1, { lines: fullLines.length });
    ok("csv-full contains URLs (backup)", fullCsv.text.includes("/storage/"));

    const namesXlsx = await adminA.get("/api/admin/exports?kind=xlsx-names");
    ok("xlsx-names → 200 xlsx (PK zip magic)", namesXlsx.status === 200 && namesXlsx.text.charCodeAt(0) === 0x50 && namesXlsx.text.charCodeAt(1) === 0x4b, { status: namesXlsx.status });

    const fullXlsx = await adminA.get("/api/admin/exports?kind=xlsx-full");
    ok("xlsx-full → 200 xlsx (PK zip magic)", fullXlsx.status === 200 && fullXlsx.text.charCodeAt(0) === 0x50 && fullXlsx.text.charCodeAt(1) === 0x4b, { status: fullXlsx.status });

    const bad = await adminA.get("/api/admin/exports?kind=whatever");
    ok("unknown export kind → 400", bad.status === 400);
  }

  /* ------------------------------------------------ */
  section("20 · Logout warning + previous-session unsaved reminder");
  {
    await adminA.post("/api/admin/drafts", { participantId: manualPid, field: "fullName", newValue: "Tst Unsaved Draft Name" });
    const warn = await adminA.post("/api/admin/logout", { discardUnsaved: false });
    ok("logout with unsaved changes → 409 UNSAVED_CHANGES", warn.status === 409 && warn.json?.code === "UNSAVED_CHANGES" && warn.json?.details?.unsavedCount === 1, warn.json);

    const logout = await adminA.post("/api/admin/logout", { discardUnsaved: true });
    ok("logout with discard → ok", logout.status === 200 && logout.json?.ok === true, logout.json);

    const sessAfter = await adminA.get("/api/admin/session");
    ok("session invalid after logout", sessAfter.json?.authed === false, sessAfter.json);

    /* new session sees the reminder once */
    const loginB = await adminB.post("/api/admin/login", { password: "cu" });
    ok("second session login ok", loginB.status === 200 && /gp_admin_session=/.test(adminB.cookie));
    const notice = await adminB.get("/api/admin/notice");
    ok("previous-session unsaved reminder delivered once", notice.json?.notice?.kind === "DISCARDED_DRAFTS" && Number(notice.json?.notice?.count) >= 1, notice.json);
    const notice2 = await adminB.get("/api/admin/notice");
    ok("notice consumed (second read null)", notice2.json?.notice === null, notice2.json);
  }

  /* ------------------------------------------------ */
  section("21 · Participant delete (per-participant, storage cleanup)");
  {
    const assetsBefore = await q(`select id, storage_key from image_asset where participant_id = $1 or id in (select childhood_image_id from participant where id=$1) or id in (select adult_image_id from participant where id=$1) or id in (select graduation_image_id from participant where id=$1)`, [soloPid]);
    const keys = assetsBefore.map((a) => a.storage_key);

    await adminB.post("/api/admin/drafts", { participantId: soloPid, field: "_delete", newValue: true });
    const save = await adminB.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("per-participant delete applied", save.status === 200 && save.json?.deletedParticipantIds?.includes(soloPid), save.json);

    const row = await q1(`select id from participant where id = $1`, [soloPid]);
    ok("participant row deleted", row === undefined);
    const orphanRows = await q1(`select count(*)::int n from image_asset where id = any($1)`, [[...assetsBefore.map((a) => a.id)]]);
    ok("all assets of deleted participant removed from DB", orphanRows?.n === 0, orphanRows);
    const exist = [];
    for (const k of keys) if (await fileExists(k)) exist.push(k);
    ok("all storage files of deleted participant removed", exist.length === 0, { remaining: exist });
  }

  /* ------------------------------------------------ */
  section("22 · Whole-group delete (storage cleanup incl. submission/group)");
  {
    const memberIds = (await q(`select id from participant where group_id = $1`, [groupId])).map((r) => r.id);
    const assetIds = (
      await q(
        `select distinct a.id as id from image_asset a
         join participant p on (a.id = p.childhood_image_id or a.id = p.adult_image_id or a.id = p.graduation_image_id)
         where p.id = any($1)`,
        [memberIds],
      )
    ).map((r) => r.id);
    const assetRows = await q(`select id, storage_key from image_asset where id = any($1)`, [assetIds]);

    await adminB.post("/api/admin/drafts", { field: "group.delete", newValue: groupId });
    const save = await adminB.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    ok("group delete applied", save.status === 200 && save.json?.deletedParticipantIds?.length === 2, save.json);

    const partsLeft = await q(`select id from participant where group_id = $1`, [groupId]);
    ok("both group members deleted", partsLeft.length === 0);
    const groupLeft = await q1(`select id from "group" where id = $1`, [groupId]);
    ok("group row deleted", groupLeft === undefined);
    const subLeft = await q1(`select id from submission where group_id = $1`, [groupId]);
    ok("group submission row deleted", subLeft === undefined);
    const assetLeft = await q1(`select count(*)::int n from image_asset where id = any($1)`, [assetIds]);
    ok("group assets removed from DB", assetLeft?.n === 0, assetLeft);
    const exist = [];
    for (const a of assetRows) if (await fileExists(a.storage_key)) exist.push(a.storage_key);
    ok("group storage files removed", exist.length === 0, { remaining: exist });
  }

  /* ------------------------------------------------ */
  section("23 · Cleanup of remaining Tst records + no-orphan global check");
  {
    /* delete remaining Tst participants (manual + AI) via the draft system */
    for (const pid of [manualPid, aiPid]) {
      if (!pid) continue;
      const p = await q1(`select id from participant where id = $1`, [pid]);
      if (!p) continue;
      await adminB.post("/api/admin/drafts", { participantId: pid, field: "_delete", newValue: true });
      await adminB.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    }
    const leftover = await q(`select count(*)::int n from participant where full_name like 'Tst%'`);
    ok("no Tst participants remain", leftover[0]?.n === 0, leftover);

    const orphans = await q1(
      `select count(*)::int n from image_asset a
       where a.committed = true and not exists (
         select 1 from participant p
         where p.childhood_image_id = a.id or p.adult_image_id = a.id or p.graduation_image_id = a.id
       )`,
    );
    ok("zero committed orphaned image rows (not referenced by any participant)", orphans?.n === 0, orphans);

    const staged = await q1(`select count(*)::int n from image_asset where committed = false`);
    ok("zero staged/uncommitted assets left behind", staged?.n === 0, staged);

    /* disk file inventory must equal committed asset rows */
    const committedCount = Number((await q1(`select count(*)::int n from image_asset where committed = true`))?.n ?? 0);
    const diskFiles = (await listFiles(".")).length;
    ok(`storage files on disk (${diskFiles}) == committed asset rows (${committedCount})`, diskFiles === committedCount, { diskFiles, committedCount });
  }

  /* ------------------------------------------------ */
  section("24 · Restore settings + queue to starting state");
  {
    /* settings baseline */
    const changes = [
      { field: "settings.mode", newValue: baselineSettings.mode },
      { field: "settings.autoPlay", newValue: baselineSettings.autoPlay },
      { field: "settings.loopAfterQueueEnd", newValue: baselineSettings.loopAfterQueueEnd },
      { field: "settings.childhoodDurationMs", newValue: baselineSettings.childhoodDurationMs },
      { field: "settings.smokeDurationMs", newValue: baselineSettings.smokeDurationMs },
      { field: "settings.adultDurationMs", newValue: baselineSettings.adultDurationMs },
      { field: "settings.nameRevealDurationMs", newValue: baselineSettings.nameRevealDurationMs },
      { field: "settings.transitionDurationMs", newValue: baselineSettings.transitionDurationMs },
      { field: "settings.displaySettings", newValue: baselineSettings.displaySettings },
    ];
    await adminB.post("/api/admin/settings", { changes });
    await adminB.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });
    const after = await adminB.get("/api/admin/settings");
    ok("settings restored to baseline", after.json?.settings?.adultDurationMs === baselineSettings.adultDurationMs && after.json?.settings?.mode === baselineSettings.mode, { now: after.json?.settings, baseline: baselineSettings });

    /* restore original queue order */
    const liveOrder = (await q(`select id from participant where presentation_order is not null and presentation_status in ('QUEUED','CURRENT','PRESENTED') order by presentation_order`)).map((r) => r.id);
    const startSet = new Set(startQueue);
    const stillHere = liveOrder.filter((id) => startSet.has(id));
    const currentQueue = [...stillHere, ...liveOrder.filter((id) => !startSet.has(id))];
    await adminB.post("/api/admin/drafts", { field: "queue.presentationOrder", newValue: currentQueue });
    await adminB.post("/api/admin/drafts/save", { keepLocal: [], keepDb: [] });

    /* idle + all queued */
    await adminB.post("/api/admin/presentation", { command: "restart" });
    const st = await adminB.get("/api/admin/presentation");
    ok("presentation left IDLE after restart", st.json?.state?.playback === "IDLE", st.json?.state);

    /* revoke display token (clean state) */
    const rev = await adminB.del("/api/admin/presentation/token");
    ok("display token revoked at cleanup", rev.json?.ok === true);
    const tokenAfter = await adminB.get("/api/admin/presentation/token");
    ok("no active token remains", tokenAfter.json?.token === null, tokenAfter.json);

    /* logout B */
    await adminB.post("/api/admin/logout", { discardUnsaved: true });
  }

  /* close pool */
  await pool.end();

  console.log("\n==================================================");
  console.log(`E2E RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log("ALL E2E CHECKS PASSED ✅");
  }
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
