import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Maps API organ labels (including compound strings) to a stable glyph key. */
export function normalizeOrganKey(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'default';
  const head = s.split('/')[0].replace(/\([^)]*\)/g, '').trim().toLowerCase();

  if (/brain|nervous|cognitive|neural/.test(head)) return 'brain';
  if (/liver|hepat/.test(head)) return 'liver';
  if (/heart|vessel|cardio|circul|vascular/.test(head)) return 'heart';
  if (/gut|intestin|digest|microbiome|colon|bowel/.test(head)) return 'gut';
  if (/kidney|renal/.test(head)) return 'kidney';
  if (/pancreas/.test(head)) return 'pancreas';
  if (/skin|derm|epiderm/.test(head)) return 'skin';
  if (/lung|pulmon/.test(head)) return 'lung';

  const w = head.split(/\s+/)[0];
  const aliases: Record<string, string> = {
    brain: 'brain',
    liver: 'liver',
    heart: 'heart',
    gut: 'gut',
    kidney: 'kidney',
    pancreas: 'pancreas',
    skin: 'skin',
    lungs: 'lung',
    lung: 'lung',
  };
  return aliases[w] ?? 'default';
}

interface OrganGlyphProps {
  organName: string;
  size?: number;
  color: string;
}

const STROKE = 1.35;

/** Closed / open paths: recognizable silhouettes, spaced for react-native-svg. */
const ORGAN_STROKES: Record<string, string[]> = {
  brain: [
    'M 12 5 C 14.4 5 16.2 6.6 16.6 8.8 C 16.9 10.2 16.5 11.6 15.8 12.8 C 16.8 13.5 17.4 14.8 17.2 16.2 C 17 17.8 15.6 19 14 18.8 C 13.2 18.7 12.6 18.2 12.2 17.5 C 11.8 18.2 11.2 18.7 10.4 18.8 C 8.8 19 7.4 17.8 7.2 16.2 C 7 14.8 7.6 13.5 8.6 12.8 C 7.9 11.6 7.5 10.2 7.8 8.8 C 8.2 6.6 10 5 12 5 Z',
    'M 12 7.5 L 12 14',
    'M 9.8 9 C 10.2 10.2 10.5 11.4 10.4 12.6',
    'M 14.2 9 C 13.8 10.2 13.5 11.4 13.6 12.6',
  ],
  liver: [
    'M 7.2 8.8 L 6.6 14.2 C 6.4 16.8 8.6 19.2 11.8 19.4 C 14.6 19.6 17.4 17.6 17.8 14.6 L 18.4 10.2 C 18.7 7.8 17.2 5.6 14.6 5.2 C 13.4 5 12 5.4 10.8 6.4 L 9.8 7.2 C 8.8 7.6 8 8.2 7.2 8.8 Z',
    'M 11.2 6 L 11.8 11.5 L 14.8 10.8',
  ],
  heart: [
    'M 12 18.8 C 9 17 6.8 14.2 6.8 11.2 C 6.8 9.2 8 7.8 9.8 7.8 C 10.8 7.8 11.6 8.4 12 9.2 C 12.4 8.4 13.2 7.8 14.2 7.8 C 16 7.8 17.2 9.2 17.2 11.2 C 17.2 14.2 15 17 12 18.8 Z',
  ],
  gut: [
    'M 5.5 7.5 C 7.5 6.2 9.2 8 8.8 9.8 C 8.5 11.5 9.8 12.8 11.5 12.5 C 13.2 12.2 14 10.5 13.2 9 C 12.6 7.8 13.2 6.5 14.8 6.2 C 16.6 5.9 18.2 7.5 18.5 9.5',
    'M 5.5 12 C 7.8 10.8 10 12.5 10.2 14.2 C 10.5 16 12.5 17 14.2 16.2 C 15.8 15.5 16.5 13.5 15.2 12 C 14.2 10.8 15 9.2 16.8 8.8',
    'M 6 16.5 C 8.2 15.2 10.5 17 11.2 18.5 C 11.8 19.8 13.5 20.2 15 19.5 C 16.8 18.6 17.5 16.5 16.2 15',
  ],
  kidney: [
    'M 14.8 4.8 C 17.8 5.2 19.8 8 19.8 11.8 C 19.8 15.8 17.5 18.8 14.2 19.2 C 11.8 19.5 9.5 18.2 8.5 15.8 C 7.8 14 8 12 8.8 10.5 C 9.6 9 11.2 8.2 12.8 8.5 C 13.2 6.8 14 5 14.8 4.8 Z',
    'M 12.2 9.5 C 11.5 11 11.2 12.8 11.8 14.2',
  ],
  pancreas: [
    'M 4.5 12.2 C 7.5 9.8 12 8.8 16.2 10.2 C 18.5 11 19.6 13 18.8 15.2 C 18 17.2 15.5 18.2 12.8 17.6 C 9.8 16.8 6.8 15 5.2 13.5 C 4.8 13 4.5 12.5 4.5 12.2 Z',
    'M 16.5 10.5 L 18.8 9.2 C 19.5 10.2 19.2 11.6 18.2 12.4',
  ],
  skin: [
    'M 3.5 8.5 C 6 7.2 8.5 7.2 11 8.5 C 13.5 9.8 16 9.8 18.5 8.5 C 19 8.2 19.5 8 20 7.8',
    'M 3.5 12 C 6 10.8 8.5 10.8 11 12 C 13.5 13.2 16 13.2 18.5 12 C 19.5 11.5 20.5 11.2 21 10.8',
    'M 3.5 15.5 C 6 14.2 8.5 14.2 11 15.5 C 13.5 16.8 16 16.8 18.5 15.5',
  ],
  lung: [
    'M 12 3.5 L 12 20',
    'M 9 5.8 C 7.2 7.5 6.2 10 6.2 13.2 C 6.2 17.2 8.2 19.8 11.5 20 L 12 20',
    'M 15 5.8 C 16.8 7.5 17.8 10 17.8 13.2 C 17.8 17.2 15.8 19.8 12.5 20 L 12 20',
  ],
  default: ['M 12 5.5 C 9.5 5.5 7.8 7.5 7.8 10 L 7.8 14 C 7.8 16.5 9.5 18.5 12 18.5 C 14.5 18.5 16.2 16.5 16.2 14 L 16.2 10 C 16.2 7.5 14.5 5.5 12 5.5 Z'],
};

function StrokeOrgan({ paths, size, color }: { paths: string[]; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

export function OrganGlyph({ organName, size = 22, color }: OrganGlyphProps) {
  const key = normalizeOrganKey(organName);
  const paths = ORGAN_STROKES[key] ?? ORGAN_STROKES.default;
  return <StrokeOrgan paths={paths} size={size} color={color} />;
}
