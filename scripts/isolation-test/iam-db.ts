// Small database helper for iam.mjs. Prints one JSON line.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));
const [cmd, arg] = process.argv.slice(2);

async function main() {
  let out: unknown = {};
  if (cmd === "grant-caretaker-rent") {
    await prisma.orgRole.update({ where: { id: ids.ALPHA.caretakerRole }, data: { permissions: ["maintenance.manage", "rent.manage"] } });
  } else if (cmd === "revoke-caretaker-rent") {
    await prisma.orgRole.update({ where: { id: ids.ALPHA.caretakerRole }, data: { permissions: ["maintenance.manage"] } });
  } else if (cmd === "suspend-victim") {
    await prisma.user.update({ where: { id: ids.ALPHA.victimUser }, data: { active: false } });
  } else if (cmd === "restore-victim") {
    await prisma.user.update({ where: { id: ids.ALPHA.victimUser }, data: { active: true } });
  } else if (cmd === "lock-state") {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "alpha-lock@test.local" } });
    out = { lockedUntil: u.lockedUntil?.toISOString() ?? null, failedLogins: u.failedLogins };
  } else if (cmd === "unlock") {
    await prisma.user.update({ where: { email: "alpha-lock@test.local" }, data: { lockedUntil: null, failedLogins: 0 } });
  } else if (cmd === "role-exists") {
    out = { exists: !!(await prisma.orgRole.findFirst({ where: { orgId: ids.ALPHA.org, name: arg } })) };
  } else if (cmd === "user-role") {
    const u = await prisma.user.findUnique({ where: { email: arg } });
    out = { role: u?.role ?? null };
  }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
