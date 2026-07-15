export type PersonalEventFamily =
  | "career"
  | "caregiving"
  | "health"
  | "housing"
  | "lifestyle"
  | "maintenance"
  | "social";

export type PersonalEventExperience = Readonly<{
  family: PersonalEventFamily;
  title: string;
  situation: string;
  parameterLabels: Readonly<Record<string, string>>;
  choiceLabels: Readonly<Record<string, string>>;
}>;

const EXPERIENCES: Readonly<Record<string, PersonalEventExperience>> = Object.freeze({
  "personal.unexpected_repair": {
    family: "maintenance",
    title: "Something essential needs a repair",
    situation: "A routine failure cannot be ignored. The bill is due before your next normal month can begin.",
    parameterLabels: { repair_cost_cents: "Quoted repair cost" },
    choiceLabels: { repair_now: "Approve the repair", negotiate_repair: "Shop around and negotiate" },
  },
  "personal.medical_bill": {
    family: "health",
    title: "An unexpected medical bill arrives",
    situation: "A health visit produced a bill you did not include in this month's plan.",
    parameterLabels: { gross_bill_cents: "Gross medical bill" },
    choiceLabels: { pay_uninsured: "Pay without coverage", use_insurance: "Use your health coverage" },
  },
  "personal.industry_layoff": {
    family: "career",
    title: "Your employer announces a layoff",
    situation: "Your income stops while the job market absorbs a wave of workers from the same industry.",
    parameterLabels: { income_gap_cents: "Estimated income gap" },
    choiceLabels: { maintain_lifestyle: "Maintain current spending", emergency_budget: "Activate an emergency budget" },
  },
  "personal.property_emergency": {
    family: "housing",
    title: "Your home suffers major damage",
    situation: "A low-frequency property loss demands an immediate restoration decision.",
    parameterLabels: { restoration_cost_cents: "Gross restoration cost" },
    choiceLabels: { restore_uninsured: "Pay for restoration", file_covered_claim: "File a covered claim" },
  },
  "personal.lifestyle_upgrade": {
    family: "lifestyle",
    title: "Your social circle raises the spending bar",
    situation: "A nicer recurring lifestyle is within reach, but accepting it permanently changes your cost base.",
    parameterLabels: { annual_cost_increase_cents: "Added annual spending" },
    choiceLabels: { accept_upgrade: "Upgrade the lifestyle", keep_current_lifestyle: "Keep today's spending level" },
  },
  "personal.transport_breakdown": {
    family: "maintenance",
    title: "Your transportation breaks down",
    situation: "The transport you rely on for work is suddenly unavailable. You need a reliable alternative now.",
    parameterLabels: { transport_cost_cents: "Reliable repair or replacement cost" },
    choiceLabels: { restore_reliable_transport: "Restore reliable transportation", use_temporary_transport: "Use a temporary workaround" },
  },
  "personal.lease_renewal_jump": {
    family: "housing",
    title: "Your lease renewal is much higher",
    situation: "The renewal notice arrives with a material rent increase and a short decision window.",
    parameterLabels: { annual_rent_increase_cents: "Added annual rent" },
    choiceLabels: { renew_lease: "Renew at the higher rent", move_to_lower_cost_home: "Move to a lower-cost home" },
  },
  "personal.home_system_failure": {
    family: "housing",
    title: "A major home system fails",
    situation: "Heating, cooling, plumbing, or another essential home system stops working without warning.",
    parameterLabels: { repair_cost_cents: "Full repair cost" },
    choiceLabels: { replace_failed_system: "Complete the full repair", stabilize_then_save: "Stabilize it temporarily" },
  },
  "personal.wedding_invitation": {
    family: "social",
    title: "A close friend invites you to their wedding",
    situation: "The date matters to someone you love, but travel, a gift, and lodging were not in your plan.",
    parameterLabels: { attendance_cost_cents: "Full attendance cost" },
    choiceLabels: { attend_full_trip: "Attend the full celebration", attend_on_a_budget: "Attend with a firm budget", decline_invitation: "Decline the invitation" },
  },
  "personal.family_care_request": {
    family: "caregiving",
    title: "A family member suddenly needs help",
    situation: "A relative asks for urgent financial or caregiving support. There is no consequence-free answer.",
    parameterLabels: { care_cost_cents: "Requested support" },
    choiceLabels: { fund_the_request: "Fund the full request", share_cost_and_time: "Share money and caregiving time", set_a_financial_boundary: "Set a financial boundary" },
  },
  "personal.essential_device_failure": {
    family: "maintenance",
    title: "An essential device stops working",
    situation: "The device you depend on for work or daily administration fails unexpectedly.",
    parameterLabels: { replacement_cost_cents: "Reliable replacement cost" },
    choiceLabels: { buy_reliable_replacement: "Buy a reliable replacement", buy_refurbished: "Buy refurbished" },
  },
});

export function getPersonalEventExperience(templateId: string): PersonalEventExperience | null {
  return EXPERIENCES[templateId] ?? null;
}

export function personalEventFamily(templateId: string): PersonalEventFamily | null {
  return getPersonalEventExperience(templateId)?.family ?? null;
}
