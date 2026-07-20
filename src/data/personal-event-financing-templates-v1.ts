import type {
  PersonalEventEffectV2,
  PersonalEventTemplateV2,
} from "../core/personal-event-v2";
import { deepFreeze } from "./personal-event-template-helpers";

const FINANCED_RESPONSES = new Map<string, ReadonlySet<string>>([
  ["personal.medical_bill", new Set(["medical_payment_plan"])],
  ["personal.transport_repair", new Set(["payment_plan"])],
  ["personal.transport_repair_followup", new Set(["repair_payment_plan"])],
  ["personal.work_device_replacement", new Set(["device_payment_plan"])],
  ["personal.reduced_work_hours", new Set(["spread_income_gap"])],
  ["personal.social_commitment", new Set(["spread_commitment_cost"])],
  ["personal.countertop_gadget_sale", new Set(["four_month_plan"])],
  ["personal.raccoon_management_followup", new Set(["cleanup_payment_plan"])],
]);

function highestVersion(
  catalog: readonly PersonalEventTemplateV2[],
  templateId: string,
): PersonalEventTemplateV2 {
  const candidates = catalog.filter(({ id }) => id === templateId);
  const source = candidates.toSorted((left, right) => right.version - left.version)[0];
  if (source === undefined) throw new RangeError(`missing financing source ${templateId}`);
  return source;
}

function convertFinancingEffect(effect: PersonalEventEffectV2): PersonalEventEffectV2 {
  if (effect.type !== "recurring_expense") return effect;
  return {
    type: "financed_expense",
    magnitude: effect.magnitude,
    durationMonths: effect.durationMonths,
  };
}

/**
 * Preserve all historical template versions while publishing corrected active
 * versions whose explicitly financed choices create real installment debt.
 */
export function createPersonalEventFinancingTemplatesV1(
  catalog: readonly PersonalEventTemplateV2[],
): readonly PersonalEventTemplateV2[] {
  const versionedTemplateIds = new Set(FINANCED_RESPONSES.keys());
  let addedDependency = true;
  while (addedDependency) {
    addedDependency = false;
    const activeSources = [...new Set(catalog.map(({ id }) => id))]
      .map((id) => highestVersion(catalog, id));
    for (const source of activeSources) {
      const followsVersionedTarget = source.followUps.some((followUp) =>
        versionedTemplateIds.has(followUp.templateId) &&
        followUp.templateVersion === highestVersion(catalog, followUp.templateId).version
      );
      if (followsVersionedTarget && !versionedTemplateIds.has(source.id)) {
        versionedTemplateIds.add(source.id);
        addedDependency = true;
      }
    }
  }
  const nextVersions = new Map(
    [...versionedTemplateIds].map((templateId) => {
      const source = highestVersion(catalog, templateId);
      return [templateId, source.version + 1] as const;
    }),
  );

  return deepFreeze([...versionedTemplateIds].map((templateId) => {
    const source = highestVersion(catalog, templateId);
    const responseIds = FINANCED_RESPONSES.get(templateId) ?? new Set<string>();
    for (const responseId of responseIds) {
      const response = source.responses.find(({ id }) => id === responseId);
      if (
        response === undefined ||
        response.effects.filter(({ type }) => type === "recurring_expense").length !== 1
      ) {
        throw new RangeError(`invalid financing response ${templateId}.${responseId}`);
      }
    }
    return {
      ...source,
      version: nextVersions.get(templateId)!,
      responses: source.responses.map((response) =>
        responseIds.has(response.id)
          ? {
              ...response,
              effects: response.effects.map(convertFinancingEffect),
            }
          : response
      ),
      followUps: source.followUps.map((followUp) => ({
        ...followUp,
        templateVersion:
          followUp.templateVersion === highestVersion(catalog, followUp.templateId).version
            ? nextVersions.get(followUp.templateId) ?? followUp.templateVersion
            : followUp.templateVersion,
      })),
    };
  }));
}
