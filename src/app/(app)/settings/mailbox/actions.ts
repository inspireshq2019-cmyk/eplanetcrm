"use server";

import { revalidatePath } from "next/cache";
import { audit, can, requireUser } from "@/lib/auth";
import { disconnectMailbox, sendMail } from "@/lib/mailbox";
import type { ActionResult } from "@/components/action-form";

export async function disconnect() {
  const u = await requireUser();
  if (!can(u, "settings.system")) return;
  await disconnectMailbox();
  await audit(u, "delete", "setting", "admissions_mailbox");
  revalidatePath("/settings/mailbox");
}

export async function sendTest(): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "settings.system")) return { error: "Only owners can do this." };
  try {
    const r = await sendMail({ to: [u.email], subject: "Eplanet CRM: admissions mailbox test", text: `This is a test from the Eplanet CRM.\n\nApplication packs and sub-agent sign-in codes will be sent from this mailbox.\n\nSent by ${u.name}.` });
    return { ok: `Test email sent from ${r.from} to ${u.email}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the test email." };
  }
}
