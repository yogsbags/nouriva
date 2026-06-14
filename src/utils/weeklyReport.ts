import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { FoodLog } from './history';
import { GENERAL_NUTRITION_SOURCES, LAB_REFERENCE_SOURCES } from '../constants/medicalSources';

function scoreColor(score: number): string {
  if (score >= 7.5) return '#10B981';
  if (score >= 5) return '#F59E0B';
  return '#EF4444';
}

function avgOrganScores(logs: FoodLog[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const log of logs) {
    const organs: any[] = log.organ_data ?? [];
    for (const o of organs) {
      const val = parseFloat(String(o.score).split('/')[0]);
      if (isNaN(val)) continue;
      if (!totals[o.organ]) totals[o.organ] = { sum: 0, count: 0 };
      totals[o.organ].sum += val;
      totals[o.organ].count += 1;
    }
  }
  const result: Record<string, number> = {};
  for (const [organ, { sum, count }] of Object.entries(totals)) {
    result[organ] = Math.round((sum / count) * 10) / 10;
  }
  return result;
}

function topAlerts(logs: FoodLog[]): { type: string; count: number }[] {
  const freq: Record<string, number> = {};
  for (const log of logs) {
    const alerts: any[] = log.alerts ?? [];
    for (const a of alerts) {
      const key = a.type?.replace(/^[^a-zA-Z]+/, '').trim() || 'Unknown';
      freq[key] = (freq[key] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildHTML(logs: FoodLog[], userName: string, weekLabel: string): string {
  const totalScans = logs.length;
  const scores = logs.map(l => l.vitality_score).filter(s => s > 0);
  const avgVitality = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const best = logs.reduce((a, b) => a.vitality_score > b.vitality_score ? a : b, logs[0]);
  const worst = logs.reduce((a, b) => a.vitality_score < b.vitality_score ? a : b, logs[0]);

  const glPeaks = logs.map(l => l.glucose_peak).filter(Boolean) as number[];
  const avgGlucosePeak = glPeaks.length ? Math.round(glPeaks.reduce((a, b) => a + b, 0) / glPeaks.length) : null;
  const glExcursions = logs.map(l => l.glucose_excursion).filter(Boolean) as number[];
  const avgExcursion = glExcursions.length ? Math.round(glExcursions.reduce((a, b) => a + b, 0) / glExcursions.length) : null;

  const organAvgs = avgOrganScores(logs);
  const alerts = topAlerts(logs);
  const avgVitalityNum = parseFloat(avgVitality);

  const organRows = Object.entries(organAvgs).map(([organ, avg]) => `
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#1e293b;">${organ}</td>
      <td style="padding:8px 12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;background:#f1f5f9;border-radius:4px;height:8px;">
            <div style="width:${avg * 10}%;background:${scoreColor(avg)};height:8px;border-radius:4px;"></div>
          </div>
          <span style="font-weight:800;color:${scoreColor(avg)};min-width:36px;">${avg}/10</span>
        </div>
      </td>
    </tr>`).join('');

  const alertRows = alerts.map(a => `
    <tr>
      <td style="padding:7px 12px;color:#475569;font-size:13px;">${a.type}</td>
      <td style="padding:7px 12px;text-align:center;">
        <span style="background:#FEF3C7;color:#92400E;padding:2px 10px;border-radius:12px;font-weight:700;font-size:13px;">${a.count}x</span>
      </td>
    </tr>`).join('');

  const mealRows = logs.slice(0, 14).map(log => {
    const date = new Date(log.created_at);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const sc = log.vitality_score;
    const macros = log.macros;
    return `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 12px;">
        ${log.image_url ? `<img src="${log.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;display:block;" />` : `<div style="width:44px;height:44px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">🥗</div>`}
      </td>
      <td style="padding:10px 12px;">
        <div style="font-weight:700;color:#1e293b;font-size:14px;">${log.food_name}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${dateStr} · ${timeStr}</div>
        ${macros ? `<div style="color:#64748b;font-size:11px;margin-top:3px;">${macros.calories} · P:${macros.protein} · C:${macros.carbs} · F:${macros.fats}</div>` : ''}
      </td>
      <td style="padding:10px 12px;text-align:center;">
        <span style="font-size:18px;font-weight:900;color:${scoreColor(sc)};">${sc.toFixed(1)}</span>
        <div style="color:#94a3b8;font-size:10px;">/ 10</div>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #f8fafc; color: #1e293b; }
  .page { max-width: 720px; margin: 0 auto; padding: 40px 32px; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: middle; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
    <div>
      <div style="font-size:22px;font-weight:900;color:#4F46E5;letter-spacing:-0.5px;">Nouriva AI</div>
      <div style="font-size:13px;color:#64748b;margin-top:2px;">Weekly nutrition report</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:15px;font-weight:700;color:#1e293b;">${userName || 'User'}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${weekLabel}</div>
    </div>
  </div>

  <!-- Summary stats -->
  <div style="display:flex;gap:12px;margin-bottom:28px;">
    ${[
      { label: 'Total Scans', value: String(totalScans), color: '#4F46E5' },
      { label: 'Avg Vitality', value: avgVitality, color: scoreColor(avgVitalityNum) },
      { label: 'Avg Glucose Peak', value: avgGlucosePeak ? `${avgGlucosePeak} mg/dL` : '—', color: avgGlucosePeak && avgGlucosePeak > 140 ? '#F59E0B' : '#10B981' },
      { label: 'Avg Excursion', value: avgExcursion ? `+${avgExcursion}` : '—', color: '#64748b' },
    ].map(s => `
      <div style="flex:1;background:#fff;border-radius:14px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:${s.color};">${s.value}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${s.label}</div>
      </div>`).join('')}
  </div>

  <!-- Best / Worst -->
  ${best && worst ? `
  <div style="display:flex;gap:12px;margin-bottom:28px;">
    <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;">
      <div style="font-size:10px;font-weight:800;color:#10B981;letter-spacing:1px;margin-bottom:6px;">BEST MEAL</div>
      <div style="font-weight:700;color:#1e293b;font-size:14px;">${best.food_name}</div>
      <div style="font-size:20px;font-weight:900;color:#10B981;margin-top:4px;">${best.vitality_score.toFixed(1)}<span style="font-size:12px;font-weight:500;color:#64748b;">/10</span></div>
    </div>
    <div style="flex:1;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;">
      <div style="font-size:10px;font-weight:800;color:#F59E0B;letter-spacing:1px;margin-bottom:6px;">NEEDS WORK</div>
      <div style="font-weight:700;color:#1e293b;font-size:14px;">${worst.food_name}</div>
      <div style="font-size:20px;font-weight:900;color:#F59E0B;margin-top:4px;">${worst.vitality_score.toFixed(1)}<span style="font-size:12px;font-weight:500;color:#64748b;">/10</span></div>
    </div>
  </div>` : ''}

  <!-- Organ scores -->
  ${organRows ? `
  <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e2e8f0;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Weekly Organ Score Averages</div>
    <table>${organRows}</table>
  </div>` : ''}

  <!-- Top alerts -->
  ${alertRows ? `
  <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e2e8f0;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Most Frequent Alerts This Week</div>
    <table>${alertRows}</table>
  </div>` : ''}

  <!-- Meal log -->
  <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e2e8f0;margin-bottom:32px;">
    <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Meal Log (Last ${Math.min(14, totalScans)} Scans)</div>
    <table>
      <thead>
        <tr style="border-bottom:2px solid #f1f5f9;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:700;width:60px;"></th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;font-weight:700;">Meal</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#94a3b8;font-weight:700;width:80px;">Score</th>
        </tr>
      </thead>
      <tbody>${mealRows}</tbody>
    </table>
  </div>

  <!-- Sources & citations (Apple 1.4.1: medical information must cite sources) -->
  <div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #e2e8f0;margin-bottom:32px;">
    <div style="font-size:11px;font-weight:800;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Sources &amp; Citations</div>
    <div style="font-size:11px;color:#64748b;line-height:17px;margin-bottom:10px;">
      Vitality scores, organ-system scores, and alerts in this report are heuristic estimates derived from the
      nutrient composition of your logged meals, informed by the following authoritative references:
    </div>
    ${[...GENERAL_NUTRITION_SOURCES, ...LAB_REFERENCE_SOURCES].map(s => `
    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;color:#1e293b;">${s.title}</div>
      <div style="font-size:10px;color:#64748b;line-height:15px;">${s.desc}<br/>
        <a href="${s.url}" style="color:#4F46E5;">${s.url}</a>
      </div>
    </div>`).join('')}
  </div>

  <!-- Footer -->
  <div style="text-align:center;color:#94a3b8;font-size:10px;line-height:16px;border-top:1px solid #e2e8f0;padding-top:20px;">
    Generated by Nouriva AI · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br/>
    This report is for informational purposes only and does not constitute medical advice.<br/>
    Analysis powered by Google Gemini AI.
  </div>

</div>
</body>
</html>`;
}

export async function generateAndShareWeeklyReport(
  logs: FoodLog[],
  userName: string,
): Promise<void> {
  if (logs.length === 0) throw new Error('No scans this week to report on.');

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const html = buildHTML(logs, userName, weekLabel);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Weekly Report',
    UTI: 'com.adobe.pdf',
  });
}
