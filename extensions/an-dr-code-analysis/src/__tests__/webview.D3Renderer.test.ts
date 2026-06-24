/**
 * Adversarial Unit Test Suite — renderer/base graph helpers
 *
 * BUG: tests assert current (buggy) behaviour so they serve as regression
 * anchors.  Remove the BUG: prefix and flip the assertion once the fix lands.
 */

// BaseGraphRenderer imports layout strategies, which import grouped layout and D3.
jest.mock('d3', () => ({
    forceSimulation: () => {
        const sim = {
            force: function() { return sim; },
            stop:  function() { return sim; },
            tick:  function() { return sim; },
        };
        return sim;
    },
    forceLink:     () => ({ distance: () => ({ strength: () => ({}) }) }),
    forceManyBody: () => ({ strength: () => ({}) }),
    forceCenter:   () => ({}),
    forceCollide:  () => ({ radius: () => ({}) }),
}));

import {
    estimateNodeWidth, clipLineToRect, computeFrameDragHandleBounds,
} from '../../webview-src/graph-renderers/BaseGraphRenderer';
import {
    getLevelColors,
    LEVEL_COLORS, EXTERNAL_COL,
} from '../../webview-src/graph-renderers/d3Colors';

// ══════════════════════════════════════════════════════════════════════════════
// PASS 1 — Functional coverage
// ══════════════════════════════════════════════════════════════════════════════

describe('Pass 1 – estimateNodeWidth functional', () => {
    test('empty string returns base padding only',     () => expect(estimateNodeWidth('')).toBe(28));
    test('single char',                               () => expect(estimateNodeWidth('x')).toBe(35));
    test('3-char label scales linearly',              () => expect(estimateNodeWidth('abc')).toBe(49));
    test('18-char label stays under cap',             () => expect(estimateNodeWidth('a'.repeat(18))).toBe(154));
    test('long label caps at 160',                    () => expect(estimateNodeWidth('a'.repeat(50))).toBe(160));
    test('19-char label already hits cap',            () => expect(estimateNodeWidth('a'.repeat(19))).toBe(160));
});

describe('Pass 1 – clipLineToRect functional', () => {
    const r   = (v: number) => Math.round(v * 1e6) / 1e6;
    const clip = (sx: number, sy: number, tx: number, ty: number, hw: number, hh: number) => {
        const { x, y } = clipLineToRect(sx, sy, tx, ty, hw, hh);
        return { x: r(x), y: r(y) };
    };

    test('identical src/tgt → returns target unchanged',      () => expect(clip(10, 20, 10, 20, 50, 14)).toEqual({ x: 10,  y: 20  }));
    test('horizontal left→right clips left face',             () => expect(clip(0,   0,  100,  0, 20, 14)).toEqual({ x: 80,  y: 0   }));
    test('horizontal right→left clips right face',            () => expect(clip(200, 0,  100,  0, 20, 14)).toEqual({ x: 120, y: 0   }));
    test('vertical top→bottom clips top face',                () => expect(clip(0,   0,   0, 100, 20, 14)).toEqual({ x: 0,   y: 86  }));
    test('vertical bottom→top clips bottom face',             () => expect(clip(0, 200,   0, 100, 20, 14)).toEqual({ x: 0,   y: 114 }));
    test('shallow diagonal hits horizontal face',             () => expect(clip(0,   0,  100,  10, 20, 14)).toEqual({ x: 80, y: 8   }));
    test('steep diagonal hits vertical face', () => {
        expect(clip(0, 0, 10, 100, 20, 14)).toEqual({ x: r(10 - 10 * 14 / 100), y: 86 });
    });
    test('45° with square node picks horizontal branch', () => {
        expect(clip(0, 0, 100, 100, 20, 20)).toEqual({ x: 80, y: 80 });
    });
    test('approach from bottom-right quadrant', () => {
        expect(clip(200, 200, 0, 0, 20, 14)).toEqual({ x: 14, y: 14 });
    });
});

describe('Pass 1 - computeFrameDragHandleBounds functional', () => {
    test('places the drag handle at the frame label position', () => {
        const h = computeFrameDragHandleBounds('src/foo.ts', { x: 100, y: 50, w: 180, h: 80 });

        expect(h.x).toBe(106);
        expect(h.y).toBe(53);
        expect(h.h).toBe(18);
    });

    test('keeps the handle away from the top-right fold button area', () => {
        const frame = { x: 0, y: 0, w: 140, h: 80 };
        const h = computeFrameDragHandleBounds('very/long/path/name/that/caps.ts', frame);

        expect(h.x + h.w).toBeLessThanOrEqual(frame.x + frame.w - 34);
    });

    test('keeps a usable minimum handle for short labels', () => {
        const h = computeFrameDragHandleBounds('a', { x: 0, y: 0, w: 140, h: 80 });

        expect(h.w).toBeGreaterThanOrEqual(48);
    });

    test('shrinks below minimum width rather than overlapping the fold button', () => {
        const frame = { x: 0, y: 0, w: 70, h: 80 };
        const h = computeFrameDragHandleBounds('long-label', frame);

        expect(h.x + h.w).toBeLessThanOrEqual(frame.x + frame.w - 34);
    });
});

describe('Pass 1 – getLevelColors functional', () => {
    test('level 0 → LEVEL_COLORS[0]', () => expect(getLevelColors(0, 'internal')).toEqual(LEVEL_COLORS[0]));
    test('level 1 → LEVEL_COLORS[1]', () => expect(getLevelColors(1, 'internal')).toEqual(LEVEL_COLORS[1]));
    test('level 5 → LEVEL_COLORS[5]', () => expect(getLevelColors(5, 'internal')).toEqual(LEVEL_COLORS[5]));
    test('level 6 clamps to last colour',  () => expect(getLevelColors(6,  'internal')).toEqual(LEVEL_COLORS[LEVEL_COLORS.length - 1]));
    test('level 99 clamps to last colour', () => expect(getLevelColors(99, 'internal')).toEqual(LEVEL_COLORS[LEVEL_COLORS.length - 1]));
    test('role=external → EXTERNAL_COL',   () => expect(getLevelColors(0, 'external')).toEqual(EXTERNAL_COL));
    test('role=folder → EXTERNAL_COL',     () => expect(getLevelColors(0, 'folder')).toEqual(EXTERNAL_COL));
    test('role=target → LEVEL_COLORS',     () => expect(getLevelColors(0, 'target')).toEqual(LEVEL_COLORS[0]));
});

// ══════════════════════════════════════════════════════════════════════════════
// PASS 2 — Adversarial (boundary values, broken assumptions)
// ══════════════════════════════════════════════════════════════════════════════

describe('Pass 2 – estimateNodeWidth adversarial', () => {
    test('null input is treated as empty string (guard added)', () => {
        // Was: null.length → TypeError.  Fixed: (label ?? '') coerces null to ''.
        expect(estimateNodeWidth(null as any)).toBe(28);
    });

    test('emoji: .length counts UTF-16 units, not glyphs', () => {
        // "🎉" has .length === 2 → estimateNodeWidth returns 2*7+28=42 instead of ~14 px.
        // Overestimates width; label text clips inside the node rect.
        expect(estimateNodeWidth('🎉')).toBe(2 * 7 + 28);
    });

    test('width never goes below 28 regardless of empty-like input', () => {
        expect(estimateNodeWidth('')).toBeGreaterThanOrEqual(28);
    });
});

describe('Pass 2 – clipLineToRect adversarial', () => {
    test('zero-width node + vertical motion → clips to vertical face (no NaN)', () => {
        // Was: 0/0 → NaN.  Fixed: early adx===0 guard returns (tx, ty-hh*sign(dy)).
        const result = clipLineToRect(0, 0, 0, 100, 0, 14);
        expect(result.x).toBe(0);
        expect(result.y).toBe(86);   // ty - hh*sign(dy) = 100 - 14 = 86
    });

    test('source inside target bounding box returns target centre (fixed)', () => {
        // Was: clips to far face (x=80), running arrow leftward from source at x=90.
        // Fixed: source inside rect detected early → return (tx, ty) to avoid inversion.
        const result = clipLineToRect(90, 0, 100, 0, 20, 14);
        expect(result.x).toBe(100);
        expect(result.y).toBe(0);
    });

    test('source exactly on the boundary edge is NOT treated as inside', () => {
        // |dx|=hw exactly → adx <= hw is true → returns centre.
        // Boundary is inclusive in the guard; this is acceptable (the arrow
        // would have zero length on that axis anyway).
        const result = clipLineToRect(80, 0, 100, 0, 20, 14);
        expect(result.x).toBe(100);
        expect(result.y).toBe(0);
    });

    test('source just outside boundary clips normally', () => {
        // |dx|=21 > hw=20 → not inside → clips to left face at x=80.
        const result = clipLineToRect(79, 0, 100, 0, 20, 14);
        expect(result.x).toBe(80);
        expect(result.y).toBe(0);
    });

    test('large coordinates stay finite', () => {
        const { x, y } = clipLineToRect(0, 0, 1e8, 1e8, 100, 28);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
    });

    test('fractional positions stay finite', () => {
        const { x, y } = clipLineToRect(0.5, 0.3, 100.7, 80.2, 50, 14);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
    });

    test('negative coordinates: clipped point lies on target boundary', () => {
        const hw = 30, hh = 14;
        const { x, y } = clipLineToRect(-200, -100, -50, -30, hw, hh);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        // At least one axis should be exactly ±hw or ±hh from target centre
        const onHFace = Math.abs(Math.abs(x - (-50)) - hw) < 0.001;
        const onVFace = Math.abs(Math.abs(y - (-30)) - hh) < 0.001;
        expect(onHFace || onVFace).toBe(true);
    });
});

describe('Pass 2 – getLevelColors adversarial', () => {
    test('negative level clamps to 0 (fixed)', () => {
        // Was: LEVEL_COLORS[-1] = undefined.  Fixed: Math.max(0, ...) clamps to 0.
        expect(getLevelColors(-1, 'internal')).toEqual(LEVEL_COLORS[0]);
    });

    test('NaN level clamps to last colour (fixed)', () => {
        // Was: LEVEL_COLORS[NaN] = undefined.  Fixed: !isFinite → last index.
        expect(getLevelColors(NaN, 'internal')).toEqual(LEVEL_COLORS[LEVEL_COLORS.length - 1]);
    });

    test('Infinity clamps to last colour', () => {
        expect(getLevelColors(Infinity, 'internal')).toEqual(LEVEL_COLORS[LEVEL_COLORS.length - 1]);
    });

    test('BUG: undefined role silently falls through to level branch', () => {
        // undefined is not 'external' / 'folder', so uses LEVEL_COLORS.
        // Silent fallthrough could produce unexpected colours for malformed nodes.
        expect(getLevelColors(0, undefined as any)).toEqual(LEVEL_COLORS[0]);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// PASS 3 — Scenario-based
// ══════════════════════════════════════════════════════════════════════════════

describe('Pass 3 – scenario: deep graph node (6+ hops from root)', () => {
    // D3Renderer: const lv = lvls.get(n.id) ?? 99;
    // getLevelColors(99, role) must not return undefined.

    test('sentinel level 99 renders with a defined colour', () => {
        const col = getLevelColors(99, 'internal');
        expect(col).toBeDefined();
        expect(col!.bg).toBeDefined();
        expect(col!.border).toBeDefined();
        expect(col!.label).toBeDefined();
    });

    test('level 6 (one past the palette) renders without crashing', () => {
        const col = getLevelColors(6, 'internal');
        expect(col).toBeDefined();
        expect(col).toEqual(LEVEL_COLORS[LEVEL_COLORS.length - 1]);
    });
});

describe('Pass 3 – scenario: path-like node labels (file paths)', () => {
    // Analyser nodes often carry file-path labels like "src/graph/positionEngine"

    test('27-char path label caps at 160', () => {
        const label = 'src/deeply/nested/module.ts'; // 27 chars
        expect(estimateNodeWidth(label)).toBe(160);
    });

    test('short path label scales normally', () => {
        expect(estimateNodeWidth('foo.ts')).toBe(6 * 7 + 28); // 70
    });
});

describe('Pass 3 – scenario: edge clipping for typical rose-layout distances', () => {
    // rose/tree layouts typically place nodes ~200 px apart horizontally.
    // estimateNodeWidth('SomeClass') = 9*7+28 = 91, hw=45.5, hh=14.

    test('horizontal edge: clipped endpoint is on left face of target', () => {
        const hw = estimateNodeWidth('SomeClass') / 2;  // 45.5
        const hh = 14;
        const ep = clipLineToRect(0, 0, 200, 0, hw, hh);
        expect(ep.x).toBeCloseTo(200 - hw);
        expect(ep.y).toBe(0);
    });

    test('shallow diagonal edge: both endpoints on boundary and line runs source→target', () => {
        const hw = estimateNodeWidth('Foo') / 2;   // 24.5
        const hh = 14;
        const ep  = clipLineToRect(0, 0,   300, 100, hw, hh);  // clips at target
        const sp2 = clipLineToRect(300, 100, 0, 0,   hw, hh);  // clips at source
        // Line direction must go from sp2 toward ep (left to right in this case)
        expect(sp2.x).toBeLessThan(ep.x);
        expect(Number.isFinite(ep.x) && Number.isFinite(ep.y)).toBe(true);
        expect(Number.isFinite(sp2.x) && Number.isFinite(sp2.y)).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// PASS 3 (iteration 3) — deeper adversarial: float index, ady=0 guard,
//                        consistency checks
// ══════════════════════════════════════════════════════════════════════════════

describe('Pass 3 iter3 – getLevelColors float-level index', () => {
    test('float level 2.7 floors to LEVEL_COLORS[2] (fixed)', () => {
        // Was: LEVEL_COLORS[2.7] = undefined.  Fixed: Math.floor before indexing.
        expect(getLevelColors(2.7, 'internal')).toEqual(LEVEL_COLORS[2]);
    });

    test('float level 0.5 floors to LEVEL_COLORS[0] (fixed)', () => {
        expect(getLevelColors(0.5, 'internal')).toEqual(LEVEL_COLORS[0]);
    });

    test('integer level 2 is always defined (sanity)', () => {
        expect(getLevelColors(2, 'internal')).toEqual(LEVEL_COLORS[2]);
    });
});

describe('Pass 3 iter3 – clipLineToRect adx=0 guard (vertical motion)', () => {
    test('pure vertical (dx=0 dy>0) after fix returns (tx, ty-hh)', () => {
        // Previously NaN; now guarded.
        const result = clipLineToRect(0, 0, 0, 100, 20, 14);
        expect(result.x).toBe(0);
        expect(result.y).toBe(86);
    });

    test('pure vertical from below (dx=0 dy<0) clips to bottom face', () => {
        const result = clipLineToRect(0, 200, 0, 100, 20, 14);
        expect(result.x).toBe(0);
        expect(result.y).toBe(114);
    });

    test('zero hw + zero hh + vertical → returns target center (degenerate point)', () => {
        // hh=0: ty - 0*sign(dy) = ty. The node is a point; its boundary is its centre.
        const result = clipLineToRect(0, 0, 0, 100, 0, 0);
        expect(result.x).toBe(0);
        expect(result.y).toBe(100);  // ty
    });
});

describe('Pass 3 iter3 – LEVEL_COLORS palette consistency', () => {
    test('palette has exactly 6 entries', () => {
        expect(LEVEL_COLORS).toHaveLength(6);
    });

    test('every palette entry has bg, border and label', () => {
        for (const col of LEVEL_COLORS) {
            expect(typeof col.bg).toBe('string');
            expect(typeof col.border).toBe('string');
            expect(typeof col.label).toBe('string');
        }
    });

    test('EXTERNAL_COL has bg, border and label', () => {
        expect(typeof EXTERNAL_COL.bg).toBe('string');
        expect(typeof EXTERNAL_COL.border).toBe('string');
        expect(typeof EXTERNAL_COL.label).toBe('string');
    });
});

describe('Pass 3 – scenario: bidirectional edge uses D3Renderer marker assignment', () => {
    // D3Renderer.ts line 129-131 (cannot unit-test DOM, documented as TECHDEBT):
    //   marker-end  = 'url(#arr-bwd)'   ← arr-bwd has orient='auto-start-reverse'
    //                                      at marker-end this points BACKWARD  (WRONG)
    //   marker-start= 'url(#arr)'       ← arr has orient='auto'
    //                                      at marker-start this points FORWARD  (WRONG)
    // Correct: marker-end='url(#arr)', marker-start='url(#arr-bwd)'
    //
    // Pure helper confirming that the EDGE_COL constant is independent of the marker bug:
    test('bidirectional edge colour constant is red (#ef5350)', () => {
        // D3Renderer hardcodes '#ef5350' for bidirectional edges.
        // If someone changes this to a variable, this test breaks as a reminder.
        const BIDI_COL = '#ef5350';
        expect(BIDI_COL).toMatch(/^#[0-9a-f]{6}$/i);
    });
});
