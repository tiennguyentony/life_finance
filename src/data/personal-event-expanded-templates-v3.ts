import type { PersonalEventTemplateV2 } from "../core/personal-event-v2";
import { deepFreeze, parameter } from "./personal-event-template-helpers";

function exactV2(
  catalog: readonly PersonalEventTemplateV2[],
  templateId: string,
): PersonalEventTemplateV2 {
  const template = catalog.find(
    ({ id, version }) => id === templateId && version === 2,
  );
  if (template === undefined) {
    throw new RangeError(`missing V2 source template ${templateId}`);
  }
  return template;
}

export function createPersonalEventExpandedTemplatesV3(
  historicalCatalog: readonly PersonalEventTemplateV2[],
): readonly PersonalEventTemplateV2[] {
  const medical = exactV2(historicalCatalog, "personal.medical_bill");
  const lifestyle = exactV2(historicalCatalog, "personal.lifestyle_upgrade");
  const bonus = exactV2(historicalCatalog, "personal.performance_bonus");
  const transport = exactV2(historicalCatalog, "personal.transport_repair");
  const transportFollowUp = exactV2(
    historicalCatalog,
    "personal.transport_repair_followup",
  );
  const rebate = exactV2(historicalCatalog, "personal.utility_rebate");

  return deepFreeze([
    {
      ...medical,
      version: 3,
      responses: [
        medical.responses.find(({ id }) => id === "use_insurance")!,
        {
          id: "negotiate_bill",
          label: "Negotiate the bill",
          requiresMitigationIds: [],
          effects: [
            {
              type: "temporary_expense",
              magnitude: parameter("gross_bill_cents", 700_000),
              durationMonths: 1,
            },
            {
              type: "wellbeing_delta",
              field: "burnoutPpm",
              magnitude: { source: "fixed", value: 30_000 },
            },
          ],
        },
        {
          id: "medical_payment_plan",
          label: "Use a four-month payment plan",
          requiresMitigationIds: [],
          effects: [{
            type: "recurring_expense",
            magnitude: parameter("gross_bill_cents", 300_000),
            durationMonths: 4,
          }],
        },
        medical.responses.find(({ id }) => id === "pay_uninsured")!,
      ],
    },
    {
      ...lifestyle,
      version: 3,
      responses: [
        {
          id: "keep_current_lifestyle",
          label: "Keep current spending",
          requiresMitigationIds: [],
          effects: [{
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: -20_000 },
          }],
        },
        {
          id: "trial_upgrade",
          label: "Try the upgrade for three months",
          requiresMitigationIds: [],
          effects: [{
            type: "recurring_expense",
            magnitude: parameter("annual_cost_increase_cents", 83_333),
            durationMonths: 3,
          }],
        },
        lifestyle.responses.find(({ id }) => id === "accept_upgrade")!,
      ],
    },
    {
      ...bonus,
      version: 3,
      responses: [
        {
          id: "save_bonus",
          label: "Keep the full bonus as cash",
          requiresMitigationIds: [],
          effects: [{
            type: "cash_delta",
            direction: "add",
            magnitude: parameter("bonus_cents"),
          }],
        },
        {
          id: "celebrate_some",
          label: "Celebrate and keep 70%",
          requiresMitigationIds: [],
          effects: [
            {
              type: "cash_delta",
              direction: "add",
              magnitude: parameter("bonus_cents", 700_000),
            },
            {
              type: "wellbeing_delta",
              field: "happinessPpm",
              magnitude: { source: "fixed", value: 25_000 },
            },
          ],
        },
        {
          id: "spend_most_bonus",
          label: "Spend most and keep 25%",
          requiresMitigationIds: [],
          effects: [
            {
              type: "cash_delta",
              direction: "add",
              magnitude: parameter("bonus_cents", 250_000),
            },
            {
              type: "wellbeing_delta",
              field: "happinessPpm",
              magnitude: { source: "fixed", value: 60_000 },
            },
          ],
        },
      ],
      followUps: [],
    },
    {
      ...transport,
      version: 3,
      followUps: [{
        templateId: "personal.transport_repair_followup",
        templateVersion: 3,
        delayMonths: 2,
        whenResponseIds: ["defer_repair"],
      }],
    },
    {
      ...transportFollowUp,
      version: 3,
      parameters: transportFollowUp.parameters.map((parameter) =>
        parameter.id === "escalated_repair_cost_cents"
          ? { ...parameter, maximum: 1_350_000 }
          : parameter
      ),
      responses: [
        transportFollowUp.responses.find(({ id }) => id === "complete_repair")!,
        {
          id: "repair_payment_plan",
          label: "Use a four-month repair plan",
          requiresMitigationIds: [],
          effects: [{
            type: "recurring_expense",
            magnitude: parameter("escalated_repair_cost_cents", 300_000),
            durationMonths: 4,
          }],
        },
        {
          id: "temporary_transport",
          label: "Use temporary transportation for six months",
          requiresMitigationIds: [],
          effects: [
            {
              type: "recurring_expense",
              magnitude: parameter("escalated_repair_cost_cents", 250_000),
              durationMonths: 6,
            },
            {
              type: "wellbeing_delta",
              field: "happinessPpm",
              magnitude: { source: "fixed", value: -50_000 },
            },
            {
              type: "wellbeing_delta",
              field: "burnoutPpm",
              magnitude: { source: "fixed", value: 30_000 },
            },
          ],
        },
      ],
    },
    {
      ...rebate,
      version: 3,
      responses: [
        rebate.responses.find(({ id }) => id === "claim_rebate")!,
        {
          id: "improve_efficiency",
          label: "Use the rebate for household efficiency",
          requiresMitigationIds: [],
          effects: [
            {
              type: "annual_living_cost_delta",
              magnitude: parameter("rebate_cents", -600_000),
            },
            {
              type: "wellbeing_delta",
              field: "happinessPpm",
              magnitude: { source: "fixed", value: 10_000 },
            },
          ],
        },
        {
          id: "donate_rebate",
          label: "Donate the rebate",
          requiresMitigationIds: [],
          effects: [{
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 40_000 },
          }],
        },
      ],
    },
  ] satisfies readonly PersonalEventTemplateV2[]);
}
