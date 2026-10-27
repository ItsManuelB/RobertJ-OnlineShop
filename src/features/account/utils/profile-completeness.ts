// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

export interface ProfileCompletenessInput {
  fullName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  avatarUrl: string | null;
}

export interface ProfileCompleteness {
  done: number;
  total: number;
  percent: number;
  /** Plain-language names of what is still empty. */
  missing: string[];
}

const FIELDS: { key: keyof ProfileCompletenessInput; label: string }[] = [
  { key: "fullName", label: "name" },
  { key: "phone", label: "phone number" },
  { key: "dateOfBirth", label: "birthday" },
  { key: "gender", label: "gender" },
  { key: "avatarUrl", label: "photo" },
];

/** How much of the optional profile is filled in; whitespace-only counts as empty. */
export function getProfileCompleteness(profile: ProfileCompletenessInput): ProfileCompleteness {
  const missing = FIELDS.filter(({ key }) => !profile[key]?.trim()).map(({ label }) => label);
  const total = FIELDS.length;
  const done = total - missing.length;
  return { done, total, percent: Math.round((done / total) * 100), missing };
}
