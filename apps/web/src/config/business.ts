/**
 * Business defaults shown in marketing copy. Mirrors the API settings
 * (TRIAL_DAYS_DEFAULT, REPLACEMENT_WINDOW_DAYS, FREE_REPLACEMENTS, VERIFICATION_TTL_*).
 * Owner decisions pending — see CLAUDE.md "Open decisions". Change here, in the API config and in tests together.
 */
export const business = {
  trialDaysDefault: 14,
  trialDaysMin: 7,
  trialDaysMax: 30,
  replacementWindowDays: 30,
  freeReplacements: 1,
  /** References and address must be re-checked after this many months. */
  recheckMonths: 12,
  /** An unpaid placement holds the worker for this long after the family accepts (PAYMENT_HOLD_MINUTES). */
  paymentHoldMinutes: 30,
} as const;
