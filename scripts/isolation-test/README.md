# Two-company isolation test

Proves that one company cannot read or change another company's data. Run it
against a **throwaway database**, never production (it creates test companies).

```bash
export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DB"
pnpm prisma migrate deploy
npx tsx scripts/isolation-test/seed.ts                            # creates ALPHA + BRAVO, writes ids.json
npx tsx scripts/isolation-test/snapshot.ts extra ids.json         # adds a few extra rows to ALPHA
npx tsx scripts/isolation-test/snapshot.ts snap ids.json before.json
pnpm build && pnpm start -p 3055                                  # keep running, same DATABASE_URL

node scripts/isolation-test/isolation.mjs      # read paths: ~300 page/URL checks, roles, anonymous
node scripts/isolation-test/attack.mjs         # write paths: ALPHA submits forms using BRAVO's IDs
npx tsx scripts/isolation-test/snapshot.ts snap ids.json after.json
node scripts/isolation-test/compare.mjs before.json after.json    # BRAVO must be unchanged
```

Test logins use the password `Passw0rd!x` (`alpha-admin@test.local`, `bravo-staff@test.local`, ...).
Set `BASE_URL` if the app is not on `http://localhost:3055`.

## Extra checks

```bash
npx tsx scripts/isolation-test/iam-setup.ts          # custom roles + test users (run after seed.ts)
node scripts/isolation-test/iam.mjs                  # custom roles, suspension, lockout, escalation, forced password change
node scripts/isolation-test/flows.mjs                # payroll and supplier-invoice flows end to end
```
