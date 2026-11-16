import { describe, expect, it } from 'vitest';
import { hitStroke, inkToSvg, lassoSelect, simplify, strokeBox, translateStroke, unionBox, type Stroke } from '../../src/core/ink';
import { createPage, emptyVault } from '../../src/core/vault';
import { vaultToFiles } from '../../src/core/exporter';

const line = (id: string, x0: number, y0: number, x1: number, y1: number): Stroke => ({ id, tool: 'pen', color: '#000', width: 2, pts: [x0, y0, 0.5, (x0 + x1) / 2, (y0 + y1) / 2, 0.5, x1, y1, 0.5] });

describe('encre', () => {
  it('boîte englobante avec épaisseur', () => {
    expect(strokeBox(line('a', 0, 0, 100, 50))).toEqual({ minX: -2, minY: -2, maxX: 102, maxY: 52 });
    expect(unionBox([line('a', 0, 0, 10, 10), line('b', 50, 50, 60, 70)])).toEqual({ minX: -2, minY: -2, maxX: 62, maxY: 72 });
  });
  it('gomme : touche le trait, pas à côté', () => {
    const s = line('a', 0, 0, 100, 0);
    expect(hitStroke(s, 50, 3, 3)).toBe(true);
    expect(hitStroke(s, 50, 20, 3)).toBe(false);
    expect(hitStroke(s, 200, 0, 3)).toBe(false);
  });
  it('lasso : sélectionne les tracés entourés', () => {
    const square = [-10, -10, 120, -10, 120, 20, -10, 20];
    expect(lassoSelect([line('in', 0, 0, 100, 0), line('out', 0, 100, 100, 100)], square)).toEqual(['in']);
  });
  it('déplacement et allègement', () => {
    expect(translateStroke(line('a', 0, 0, 10, 0), 5, 5).pts.slice(0, 2)).toEqual([5, 5]);
    const dense = Array.from({ length: 30 }, (_, i) => [i * 0.2, 0, 0.5]).flat();
    const out = simplify(dense, 1);
    expect(out.length).toBeLessThan(dense.length);
    expect(out.slice(-3, -1)).toEqual([5.8, 0]);
  });
  it('SVG et export markdown', () => {
    const svg = inkToSvg({ strokes: [line('a', 0, 0, 100, 0)], bg: 'dots' });
    expect(svg).toContain('<path');
    const s = emptyVault();
    createPage(s, { title: 'Croquis', kind: 'canvas', ink: { strokes: [line('a', 0, 0, 10, 10)], bg: 'grid' } });
    const files = vaultToFiles(s);
    expect(files['Croquis.svg']).toContain('<svg');
    expect(files['Croquis.md']).toContain('![[Croquis.svg]]');
  });
});
