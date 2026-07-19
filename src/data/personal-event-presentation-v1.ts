import type { PersonalEventTemplateV2 } from "../core/personal-event-v2";
import { deepFreeze } from "./personal-event-template-helpers";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "./personal-event-templates-v2";

export type PersonalEventPresentationToneV1 =
  | "serious"
  | "relatable_comedy"
  | "absurd_comedy";

export type PersonalEventCadenceRoleV1 =
  | "challenge"
  | "engagement"
  | "follow_up";

export type PersonalEventPresentationV1 = Readonly<{
  templateId: string;
  templateVersion: number;
  tone: PersonalEventPresentationToneV1;
  cadenceRole: PersonalEventCadenceRoleV1;
}>;

export type PersonalEventPresentationViolationV1 = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

const RELATABLE_COMEDY_IDS = new Set([
  "personal.subscription_archaeology",
  "personal.group_chat_gift",
  "personal.countertop_gadget_sale",
  "personal.double_grocery_delivery",
  "personal.mascot_side_hustle",
  "personal.laundry_final_spin",
]);

const ABSURD_COMEDY_IDS = new Set([
  "personal.raccoon_sanitation",
  "personal.raccoon_management_followup",
  "personal.rare_yard_sale_lamp",
  "personal.lamp_market_followup",
]);

const FOLLOW_UP_IDS = new Set([
  "personal.transport_repair_followup",
  "personal.raccoon_management_followup",
  "personal.lamp_market_followup",
]);

const SERIOUS_ENGAGEMENT_IDS = new Set([
  "personal.performance_bonus",
  "personal.utility_rebate",
]);

function presentationForTemplate(
  template: PersonalEventTemplateV2,
): PersonalEventPresentationV1 {
  const tone: PersonalEventPresentationToneV1 = RELATABLE_COMEDY_IDS.has(template.id)
    ? "relatable_comedy"
    : ABSURD_COMEDY_IDS.has(template.id)
      ? "absurd_comedy"
      : "serious";
  const cadenceRole: PersonalEventCadenceRoleV1 = FOLLOW_UP_IDS.has(template.id)
    ? "follow_up"
    : tone !== "serious" || SERIOUS_ENGAGEMENT_IDS.has(template.id)
      ? "engagement"
      : "challenge";
  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    tone,
    cadenceRole,
  });
}

export const PERSONAL_EVENT_PRESENTATIONS_V1:
  readonly PersonalEventPresentationV1[] = deepFreeze(
    PERSONAL_EVENT_TEMPLATES_V2.map(presentationForTemplate),
  );

export function getPersonalEventPresentationV1(
  templateId: string,
  templateVersion: number,
): PersonalEventPresentationV1 {
  const presentation = PERSONAL_EVENT_PRESENTATIONS_V1.find(
    (candidate) =>
      candidate.templateId === templateId &&
      candidate.templateVersion === templateVersion,
  );
  if (presentation === undefined) {
    throw new RangeError(
      `unknown personal event presentation ${templateId}@${templateVersion}`,
    );
  }
  return presentation;
}

export function validatePersonalEventPresentationCatalogV1(
  templates: readonly PersonalEventTemplateV2[],
  presentations: readonly PersonalEventPresentationV1[],
): readonly PersonalEventPresentationViolationV1[] {
  const violations: PersonalEventPresentationViolationV1[] = [];
  const templateByIdentity = new Map(
    templates.map((template) => [`${template.id}@${template.version}`, template]),
  );
  const seen = new Set<string>();
  const add = (path: string, code: string, message: string): void => {
    violations.push(Object.freeze({ path, code, message }));
  };

  presentations.forEach((presentation, index) => {
    const identity = `${presentation.templateId}@${presentation.templateVersion}`;
    if (seen.has(identity)) {
      add(`${index}`, "duplicate_presentation_identity", "presentation identity must be unique");
    }
    seen.add(identity);
    const template = templateByIdentity.get(identity);
    if (template === undefined) {
      add(`${index}`, "unknown_presentation_identity", "presentation must target an exact template");
      return;
    }
    if (!["serious", "relatable_comedy", "absurd_comedy"].includes(presentation.tone)) {
      add(`${index}.tone`, "invalid_presentation_tone", "presentation tone is unsupported");
    }
    if (!["challenge", "engagement", "follow_up"].includes(presentation.cadenceRole)) {
      add(`${index}.cadenceRole`, "invalid_cadence_role", "cadence role is unsupported");
    }
    if (
      presentation.tone !== "serious" &&
      presentation.cadenceRole !== "follow_up" &&
      (template.severityTier !== "micro" || template.pressureCost > 1)
    ) {
      add(
        `${index}`,
        "unsafe_humorous_root",
        "humorous roots must be micro tier with pressure cost zero or one",
      );
    }
    if (
      presentation.cadenceRole === "follow_up" &&
      template.hazard.maximumChancePpm !== 0
    ) {
      add(
        `${index}.cadenceRole`,
        "exogenous_follow_up",
        "follow-up templates must have zero exogenous hazard",
      );
    }
  });

  templates.forEach((template, index) => {
    if (!seen.has(`${template.id}@${template.version}`)) {
      add(`${index}`, "missing_presentation_identity", "every exact template needs presentation metadata");
    }
  });
  return Object.freeze(violations);
}

const presentationViolations = validatePersonalEventPresentationCatalogV1(
  PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_PRESENTATIONS_V1,
);
if (presentationViolations.length > 0) {
  throw new Error(
    `invalid personal event presentation catalog: ${presentationViolations[0]!.path}:${presentationViolations[0]!.code}`,
  );
}
