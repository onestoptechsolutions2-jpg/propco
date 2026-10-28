"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { loadOrgMerchant, saveOrgSettings } from "@/lib/payments/config";
import { getToken } from "@/lib/payments/mpesa";
import { checkKey } from "@/lib/payments/flutterwave";

const back = (q: string) => redirect(`/settings/payments?${q}`);
const text = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function saveSettings(formData: FormData) {
  const user = await requirePermission("team.manage");
  try {
    await saveOrgSettings(prisma, user.orgId, {
      mpesaEnabled: formData.get("mpesaEnabled") === "on",
      mpesaEnv: text(formData, "mpesaEnv"),
      mpesaKind: text(formData, "mpesaKind"),
      mpesaShortcode: text(formData, "mpesaShortcode"),
      mpesaPartyB: text(formData, "mpesaPartyB"),
      mpesaConsumerKey: text(formData, "mpesaConsumerKey"),
      mpesaConsumerSecret: text(formData, "mpesaConsumerSecret"),
      mpesaPasskey: text(formData, "mpesaPasskey"),
      flutterwaveEnabled: formData.get("flutterwaveEnabled") === "on",
      flutterwaveSecretKey: text(formData, "flutterwaveSecretKey"),
      flutterwaveHash: text(formData, "flutterwaveHash"),
    });
  } catch (e) {
    back("error=" + encodeURIComponent(e instanceof Error ? e.message : "Could not save."));
  }
  await audit(user, "payments.settings", "Online payment settings changed");
  back("saved=1");
}

/** Try the saved keys against the provider so mistakes show up here, not when a tenant is paying. */
export async function testSettings(formData: FormData) {
  const user = await requirePermission("team.manage");
  const which = text(formData, "which");
  const merchant = await loadOrgMerchant(prisma, user.orgId);
  let result: string;
  try {
    if (which === "mpesa") {
      if (!merchant?.mpesa) throw new Error("M-Pesa is not fully set up: enable it and fill in every field first.");
      await getToken(merchant.mpesa);
      result = "tested=mpesa";
    } else {
      if (!merchant?.flutterwave) throw new Error("Flutterwave is not fully set up: enable it and fill in both keys first.");
      if (!(await checkKey(merchant.flutterwave))) throw new Error("Flutterwave did not accept that secret key.");
      result = "tested=flutterwave";
    }
  } catch (e) {
    result = "error=" + encodeURIComponent(e instanceof Error ? e.message : "Test failed.");
  }
  back(result);
}
