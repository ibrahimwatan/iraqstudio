import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type LocalDiscountCode = {
  id: string;
  code: string;
  discount_percent: number;
  active: boolean;
  created_at: string;
};

const databasePath = process.env.LOCAL_DISCOUNT_DB_PATH ?? join(process.cwd(), "data", "discount-codes.json");
let writeQueue = Promise.resolve();

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

async function readCodes(): Promise<LocalDiscountCode[]> {
  try {
    const raw = await readFile(databasePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as LocalDiscountCode[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("local_discount_storage");
  }
}

async function saveCodes(codes: LocalDiscountCode[]) {
  await mkdir(dirname(databasePath), { recursive: true });
  const temporaryPath = databasePath + "." + process.pid + ".tmp";
  await writeFile(temporaryPath, JSON.stringify(codes, null, 2), "utf8");
  await rename(temporaryPath, databasePath);
}

export async function listCodes() {
  return (await readCodes()).filter((code) => code.active);
}

export async function findCode(value: string) {
  const code = normalizeCode(value);
  if (!code) return null;
  return (await readCodes()).find((item) => item.active && item.code === code) ?? null;
}

export async function addCode(value: string, discountPercent: number) {
  const code = normalizeCode(value);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("invalid_discount_code_format");
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
    throw new Error("invalid_discount_percent");
  }

  let created: LocalDiscountCode | null = null;
  writeQueue = writeQueue.then(async () => {
    const codes = await readCodes();
    if (codes.some((item) => item.code === code)) throw new Error("discount_code_exists");
    created = {
      id: randomUUID(),
      code,
      discount_percent: discountPercent,
      active: true,
      created_at: new Date().toISOString(),
    };
    await saveCodes([...codes, created]);
  });
  await writeQueue;
  if (!created) throw new Error("local_discount_storage");
  return created;
}

export async function removeCode(id: string) {
  let removed = false;
  writeQueue = writeQueue.then(async () => {
    const codes = await readCodes();
    const next = codes.filter((item) => item.id !== id);
    removed = next.length !== codes.length;
    if (removed) await saveCodes(next);
  });
  await writeQueue;
  if (!removed) throw new Error("discount_code_not_found");
}
