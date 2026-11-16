import Chart from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';

// Registre des graphiques : chaque vue décrit son graphique complet à chaque
// rendu, le registre crée l'instance la première fois puis la met à jour.
// Les couleurs de texte suivent ainsi le thème clair/sombre.

const instances = new Map<string, Chart>();

// Nombres à la française (1 234,5) dans les axes et les infobulles.
Chart.defaults.locale = 'fr-FR';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const isDark = () => document.documentElement.classList.contains('dark');
export const textColor = () => (isDark() ? '#f1f5f9' : '#334155');

export function renderChart(canvasId: string, config: ChartConfiguration): void {
  const existing = instances.get(canvasId);
  if (existing) {
    existing.data = config.data;
    existing.options = config.options ?? {};
    existing.update();
    return;
  }
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  instances.set(canvasId, new Chart(canvas, config));
}

export const legendTop = () => ({
  legend: { position: 'top' as const, labels: { color: textColor(), font: { size: 10 } } },
});

export const axes = (stacked: { x?: boolean; y?: boolean } = {}) => ({
  y: { stacked: stacked.y, ticks: { color: textColor(), callback: (v: string | number) => euro.format(Number(v)) } },
  x: { stacked: stacked.x, ticks: { color: textColor() } },
});
