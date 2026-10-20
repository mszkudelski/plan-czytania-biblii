export type RecoveryPromptPreference = { disabled: boolean; snoozedUntil: string | null };
export type RecoveryPromptAction = "later" | "never" | "reset" | "stop";
export const DEFAULT_RECOVERY_PROMPT: RecoveryPromptPreference = { disabled: false, snoozedUntil: null };

export function canStartRecovery(overdue: number) {
  return overdue > 3;
}

export function recoveryPromptPreference(action: RecoveryPromptAction, now = Date.now()): RecoveryPromptPreference {
  return action === "never" ? { disabled: true, snoozedUntil: null }
    : action === "stop" ? { disabled: false, snoozedUntil: new Date(now + 86400000).toISOString() }
    : action === "later" ? { disabled: false, snoozedUntil: new Date(now + 7 * 86400000).toISOString() }
    : { ...DEFAULT_RECOVERY_PROMPT };
}
export function shouldSuggestRecovery(overdue: number, enabled: boolean, preference: RecoveryPromptPreference, now = Date.now()) {
  if (!canStartRecovery(overdue) || enabled || preference.disabled) return false;
  const until = preference.snoozedUntil ? Date.parse(preference.snoozedUntil) : 0;
  return !Number.isFinite(until) ? false : until <= now;
}
