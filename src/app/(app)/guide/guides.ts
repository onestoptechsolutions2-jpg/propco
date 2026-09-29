export type Progress = {
  hasOwner: boolean;
  hasProperty: boolean;
  hasUnit: boolean;
  hasTenant: boolean;
  hasLease: boolean;
  hasSupplier: boolean;
  hasPayment: boolean;
  hasRequest: boolean;
};

export type GuideStep = {
  id: string;
  title: string;
  /** Plain-language explanation of what this step is and why it matters. */
  why: string;
  /** Short, concrete instructions. */
  how: string[];
  href: string;
  cta: string;
  /** If set, the step is ticked automatically when this progress key is true. */
  auto?: keyof Progress;
};

export type Guide = {
  id: string;
  title: string;
  summary: string;
  steps: GuideStep[];
};

const setupStaff: Guide = {
  id: "setup",
  title: "Set up your first property",
  summary: "Add an owner, a property, a tenant and a lease. About 10 minutes.",
  steps: [
    {
      id: "owner",
      title: "Add the property owner",
      why: "Every property belongs to an owner. This is the person you pay rent to (minus your commission).",
      how: ["Press “Add owner”.", "Fill in their name and phone number.", "Choose how they want to hear from you (email, SMS or WhatsApp).", "Save."],
      href: "/owners/new",
      cta: "Add an owner",
      auto: "hasOwner",
    },
    {
      id: "property",
      title: "Add the property",
      why: "A property is a building or a house. Units (flats or rooms) live inside it.",
      how: ["Press “Add property”.", "Pick the owner you just added.", "Set your commission % (10% is the default).", "Save."],
      href: "/properties/new",
      cta: "Add a property",
      auto: "hasProperty",
    },
    {
      id: "unit",
      title: "Add the units",
      why: "A unit is the thing a tenant actually rents, for example “Flat 3B”.",
      how: ["Open the property.", "Press “Add unit”.", "Give it a name such as Flat 3B.", "A single house can have just one unit."],
      href: "/properties",
      cta: "Open properties",
      auto: "hasUnit",
    },
    {
      id: "tenant",
      title: "Add the tenant",
      why: "Tenants receive rent reminders and repair updates, so add a phone number.",
      how: ["Press “Add tenant”.", "Enter their name and phone number.", "Pick how to notify them. WhatsApp is popular."],
      href: "/tenants/new",
      cta: "Add a tenant",
      auto: "hasTenant",
    },
    {
      id: "lease",
      title: "Move the tenant into a unit",
      why: "A lease links a tenant to a unit and sets the monthly rent. Rent tracking starts from it.",
      how: ["Open the tenant from the Tenants list.", "Scroll down to the lease section.", "Choose the unit, the start date and the rent.", "Save."],
      href: "/tenants",
      cta: "Open tenants",
      auto: "hasLease",
    },
  ],
};

const setupLandlord: Guide = {
  ...setupStaff,
  summary: "Add your property, a tenant and a lease. About 8 minutes.",
  steps: setupStaff.steps.filter((s) => s.id !== "owner"),
};

const rent: Guide = {
  id: "rent",
  title: "Collect this month's rent",
  summary: "Record who has paid and follow up on those who have not.",
  steps: [
    {
      id: "open",
      title: "Open the rent list",
      why: "It shows every tenant with a status for this month: Paid, Pending or Late.",
      how: ["Open “Collect rent”.", "Late rows are flagged automatically every night."],
      href: "/rent",
      cta: "Open rent",
    },
    {
      id: "record",
      title: "Record a payment",
      why: "When a tenant pays by M-Pesa, bank or cash, note it here so owners get paid correctly.",
      how: ["Open the tenant's row.", "Choose how they paid.", "Type the M-Pesa or bank reference.", "Save. The owner is told automatically."],
      href: "/rent",
      cta: "Record a payment",
      auto: "hasPayment",
    },
    {
      id: "follow",
      title: "Follow up on late rent",
      why: "Late tenants are messaged automatically. WhatsApp messages wait for you to tap Send.",
      how: ["Open “Messages”.", "Tap “Send on WhatsApp” next to each name.", "WhatsApp opens with the text ready. Press Send."],
      href: "/notifications",
      cta: "Open messages",
    },
  ],
};

const payouts: Guide = {
  id: "payouts",
  title: "Pay your owners",
  summary: "Work out what each owner is owed and record the payment.",
  steps: [
    {
      id: "generate",
      title: "Generate the month's payouts",
      why: "PropCo adds up rent collected, then takes off your commission and any repair costs.",
      how: ["Open “Owner payouts”.", "Pick the month.", "Press “Generate payouts”.", "You can press it again later; it recalculates unpaid ones."],
      href: "/payouts",
      cta: "Open payouts",
    },
    {
      id: "check",
      title: "Check the numbers",
      why: "Each row shows rent, commission, repairs and the final amount owed.",
      how: ["Look over each owner's row.", "If a payment was missed, record it in “Collect rent” and regenerate."],
      href: "/payouts",
      cta: "Review payouts",
    },
    {
      id: "pay",
      title: "Send the money and mark it paid",
      why: "Marking it paid keeps a record and tells the owner it is on the way.",
      how: ["Send the money by M-Pesa or bank yourself.", "Come back and choose the method.", "Type the reference and press “Mark paid”."],
      href: "/payouts",
      cta: "Mark as paid",
    },
  ],
};

const repair: Guide = {
  id: "repair",
  title: "Handle a repair",
  summary: "From a broken tap to paying the plumber.",
  steps: [
    {
      id: "supplier",
      title: "Add your suppliers",
      why: "Suppliers are the plumbers, electricians and others who do the work.",
      how: ["Press “Add supplier”.", "Choose their trade and phone number.", "Save. Do this once per supplier."],
      href: "/suppliers/new",
      cta: "Add a supplier",
      auto: "hasSupplier",
    },
    {
      id: "log",
      title: "Log the repair request",
      why: "Every repair is tied to a unit so the cost lands with the right owner.",
      how: ["Open “Repair requests” and start a new request.", "Choose the unit and describe the problem."],
      href: "/maintenance/new",
      cta: "Log a repair",
      auto: "hasRequest",
    },
    {
      id: "assign",
      title: "Send it to a supplier",
      why: "The supplier is messaged with the job details.",
      how: ["Open the request.", "Pick a supplier and an estimated cost.", "Press Assign."],
      href: "/maintenance",
      cta: "Open repairs",
    },
    {
      id: "complete",
      title: "Mark it done and enter the real cost",
      why: "The final cost is taken off the owner's payout that month.",
      how: ["When the work is finished, open the request.", "Type the actual cost.", "Mark it done."],
      href: "/maintenance",
      cta: "Open repairs",
    },
    {
      id: "pay",
      title: "Pay the supplier",
      why: "Keep a record of who has been paid and who is still owed.",
      how: ["Open “Pay suppliers”.", "Send the money, then press “Mark paid” with the reference."],
      href: "/supplier-payments",
      cta: "Pay suppliers",
    },
  ],
};

const whatsapp: Guide = {
  id: "whatsapp",
  title: "Send messages on WhatsApp",
  summary: "Use your own phone's WhatsApp. No extra accounts needed.",
  steps: [
    {
      id: "choose",
      title: "Choose WhatsApp for a person",
      why: "Each owner, tenant and supplier has a “Notify via” setting.",
      how: ["Open the person's page.", "Set “Notify via” to WhatsApp and check their phone number.", "Save."],
      href: "/tenants",
      cta: "Open tenants",
    },
    {
      id: "send",
      title: "Send the waiting messages",
      why: "Messages appear in “Messages” when something happens, like late rent.",
      how: ["Open “Messages”.", "Tap “Send on WhatsApp”.", "WhatsApp opens with the text ready. Press Send.", "The number on the menu shows how many are waiting."],
      href: "/notifications",
      cta: "Open messages",
    },
  ],
};

const ownerGuide: Guide = {
  id: "owner",
  title: "Understanding your account",
  summary: "Where to see your properties, payouts and repairs.",
  steps: [
    {
      id: "props",
      title: "See your properties",
      why: "Every property and unit you own, and who is living there.",
      how: ["Open “Properties & units”."],
      href: "/properties",
      cta: "Open properties",
    },
    {
      id: "payouts",
      title: "Check your payouts",
      why: "Each month shows rent collected, commission, repairs and what you are paid.",
      how: ["Open “Owner payouts”.", "Pick a month."],
      href: "/payouts",
      cta: "Open payouts",
    },
    {
      id: "repairs",
      title: "Follow repairs",
      why: "See what was fixed at your properties and what it cost.",
      how: ["Open “Repair requests”."],
      href: "/maintenance",
      cta: "Open repairs",
    },
  ],
};

export function guidesForRole(role: string): Guide[] {
  if (role === "OWNER") return [ownerGuide];
  if (role === "LANDLORD") return [setupLandlord, rent, repair, whatsapp];
  return [setupStaff, rent, payouts, repair, whatsapp];
}
