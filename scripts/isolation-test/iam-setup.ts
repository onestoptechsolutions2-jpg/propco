// Creates the users and roles that iam.mjs needs (run after seed.ts).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";

const prisma = new PrismaClient();
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));
const hash = bcrypt.hashSync("Passw0rd!x", 10);

async function main() {
  const org = ids.ALPHA.org;
  const mk = (email: string, extra: object = {}) =>
    prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, ...extra },
      create: { orgId: org, name: email.split("@")[0], email, role: "STAFF", passwordHash: hash, ...extra },
    });

  const caretaker = await prisma.orgRole.upsert({
    where: { orgId_name: { orgId: org, name: "Caretaker" } },
    update: { permissions: ["maintenance.manage"] },
    create: { orgId: org, name: "Caretaker", permissions: ["maintenance.manage"] },
  });
  const teamLead = await prisma.orgRole.upsert({
    where: { orgId_name: { orgId: org, name: "TeamLead" } },
    update: { permissions: ["team.manage", "maintenance.manage"] },
    create: { orgId: org, name: "TeamLead", permissions: ["team.manage", "maintenance.manage"] },
  });
  // A role in the OTHER company, to prove it can't be reached.
  const bravoRole = await prisma.orgRole.upsert({
    where: { orgId_name: { orgId: ids.BRAVO.org, name: "BravoRole" } },
    update: {},
    create: { orgId: ids.BRAVO.org, name: "BravoRole", permissions: ["rent.manage"] },
  });

  await mk("alpha-caretaker@test.local", { orgRoleId: caretaker.id, active: true, mustChangePassword: false });
  await mk("alpha-teamlead@test.local", { orgRoleId: teamLead.id, active: true, mustChangePassword: false });
  await mk("alpha-suspended@test.local", { active: false });
  await mk("alpha-temp@test.local", { mustChangePassword: true, active: true });
  await mk("alpha-lock@test.local", { failedLogins: 0, lockedUntil: null, active: true });
  await mk("alpha-victim@test.local", { active: true, mustChangePassword: false, orgRoleId: null });

  const staff = await prisma.user.findUniqueOrThrow({ where: { email: "alpha-victim@test.local" } });
  ids.ALPHA.caretakerRole = caretaker.id;
  ids.ALPHA.teamLeadRole = teamLead.id;
  ids.ALPHA.victimUser = staff.id;
  ids.BRAVO.role = bravoRole.id;
  ids.BRAVO.staffUser = (await prisma.user.findUniqueOrThrow({ where: { email: "bravo-staff@test.local" } })).id;
  fs.writeFileSync("./ids.json", JSON.stringify(ids, null, 2));
  console.log("iam setup ok");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
