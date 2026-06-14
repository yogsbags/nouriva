/**
 * Static authoritative sources for medical/nutrition content (Apple 1.4.1).
 * Used as the always-available citation set in the weekly report PDF, lab-report
 * insights, and as the ResultsScreen fallback when live Google Search Grounding
 * returns nothing. All URLs verified reachable (2026-06).
 */
export type MedicalSource = { title: string; desc: string; url: string };

export const GENERAL_NUTRITION_SOURCES: MedicalSource[] = [
  {
    title: 'WHO — Healthy diet',
    desc: 'World Health Organization guidance on healthy diets and nutrient intake.',
    url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
  },
  {
    title: 'Harvard T.H. Chan — The Nutrition Source',
    desc: 'Evidence-based information on nutrition, foods, and dietary patterns.',
    url: 'https://nutritionsource.hsph.harvard.edu/',
  },
  {
    title: 'USDA FoodData Central',
    desc: 'Authoritative nutrient composition database for foods.',
    url: 'https://fdc.nal.usda.gov/',
  },
  {
    title: 'PubMed (NIH / National Library of Medicine)',
    desc: 'Peer-reviewed biomedical and nutrition research literature.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/',
  },
];

export const LAB_REFERENCE_SOURCES: MedicalSource[] = [
  {
    title: 'MedlinePlus — Lab Tests (NIH / NLM)',
    desc: 'Reference information and typical ranges for common laboratory tests.',
    url: 'https://medlineplus.gov/lab-tests/',
  },
];
