export const PROVIDER_TYPES = [
  { value: 'physician', label: 'Physician / GP' },
  { value: 'specialist', label: 'Medical specialist' },
  { value: 'nutritionist', label: 'Nutritionist' },
  { value: 'dietitian', label: 'Registered dietitian' },
  { value: 'holistic', label: 'Holistic / integrative practitioner' },
  { value: 'health_coach', label: 'Health & wellness coach' },
  { value: 'other', label: 'Other licensed provider' },
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number]['value'];

export const DOCUMENT_KINDS = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'diet_chart', label: 'Diet chart / meal plan' },
  { value: 'care_plan', label: 'Care plan' },
  { value: 'other', label: 'Other clinical document' },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['value'];

export function providerTypeLabel(type: string): string {
  return PROVIDER_TYPES.find((p) => p.value === type)?.label ?? 'Care provider';
}

export function documentKindLabel(kind: string): string {
  return DOCUMENT_KINDS.find((d) => d.value === kind)?.label ?? 'Care document';
}
