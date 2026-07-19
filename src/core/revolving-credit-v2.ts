import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { moneyCents, type MoneyCents } from "./domain/money";

export const REVOLVING_CREDIT_POLICY_V2_VERSION =
  "revolving-credit-policy-v2" as const;

/** Shared scenario assumptions keep Risk and the Financial Kernel consistent. */
export const REVOLVING_CREDIT_POLICY_V2 = Object.freeze({
  version: REVOLVING_CREDIT_POLICY_V2_VERSION,
  annualInterestRatePpm: 240_000,
  minimumPaymentRatePpm: 30_000,
  minimumPaymentFloorCents: 2_500,
});

export type RevolvingCreditMonthPlanV2 = Readonly<{
  version: typeof REVOLVING_CREDIT_POLICY_V2_VERSION;
  openingPrincipalCents: MoneyCents;
  interestCents: MoneyCents;
  scheduledPaymentCents: MoneyCents;
  principalPaidCents: MoneyCents;
  closingPrincipalBeforeNewDrawsCents: MoneyCents;
}>;

function multiplyAndRound(
  amountCents: MoneyCents,
  numerator: number,
  denominator: number,
  label: string,
): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(amountCents) * BigInt(numerator),
        BigInt(denominator),
      ),
      label,
    ),
  );
}

export function calculateRevolvingCreditInterestV2(
  principalCents: MoneyCents,
): MoneyCents {
  return multiplyAndRound(
    principalCents,
    REVOLVING_CREDIT_POLICY_V2.annualInterestRatePpm,
    12_000_000,
    "monthly revolving-credit interest",
  );
}

export function calculateRevolvingCreditMinimumPaymentV2(
  principalAfterInterestCents: MoneyCents,
): MoneyCents {
  if (principalAfterInterestCents === 0) return moneyCents(0);
  const percentage = multiplyAndRound(
    principalAfterInterestCents,
    REVOLVING_CREDIT_POLICY_V2.minimumPaymentRatePpm,
    1_000_000,
    "monthly revolving-credit minimum payment",
  );
  return moneyCents(
    Math.min(
      principalAfterInterestCents,
      Math.max(
        REVOLVING_CREDIT_POLICY_V2.minimumPaymentFloorCents,
        percentage,
      ),
    ),
  );
}

export function planRevolvingCreditMonthV2(
  openingPrincipalCents: MoneyCents,
): RevolvingCreditMonthPlanV2 {
  const interestCents = calculateRevolvingCreditInterestV2(
    openingPrincipalCents,
  );
  const principalAfterInterestCents = moneyCents(
    openingPrincipalCents + interestCents,
  );
  const scheduledPaymentCents =
    calculateRevolvingCreditMinimumPaymentV2(principalAfterInterestCents);
  return Object.freeze({
    version: REVOLVING_CREDIT_POLICY_V2_VERSION,
    openingPrincipalCents,
    interestCents,
    scheduledPaymentCents,
    principalPaidCents: moneyCents(
      Math.max(0, scheduledPaymentCents - interestCents),
    ),
    closingPrincipalBeforeNewDrawsCents: moneyCents(
      principalAfterInterestCents - scheduledPaymentCents,
    ),
  });
}
