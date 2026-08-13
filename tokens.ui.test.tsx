import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import tailwindConfigRaw from './tailwind.config.js';

// tailwind.config.js is typed via JSDoc as `import('tailwindcss').Config`, whose
// `theme.extend.*` entries are typed as `ResolvableTo<...>` (object | function).
// The config in this repo only ever uses plain objects, so widen to `any` here
// purely for test-time property access — this does not affect the real config.
const tailwindConfig = tailwindConfigRaw as any;

describe('design tokens: tailwind.config.js', () => {
    it('exposes the app-* color tokens', () => {
        const colors = tailwindConfig.theme.extend.colors;
        expect(colors).toMatchObject({
            'app-bg': 'var(--app-bg)',
            'app-surface': 'var(--app-surface)',
            'app-surface-strong': 'var(--app-surface-strong)',
            'app-text': 'var(--app-text)',
            'app-muted': 'var(--app-muted)',
            'app-accent': 'var(--app-accent)',
            'app-accent-text': 'var(--app-accent-text)',
            'app-border': 'var(--app-border)',
            'app-danger': 'var(--app-danger)',
            'app-success': 'var(--app-success)',
            'app-warning': 'var(--app-warning)'
        });
    });

    it('exposes the borderRadius scale', () => {
        const borderRadius = tailwindConfig.theme.extend.borderRadius;
        expect(borderRadius).toMatchObject({
            control: '12px',
            card: '18px',
            sheet: '24px'
        });
    });

    it('exposes the fontSize scale', () => {
        const fontSize = tailwindConfig.theme.extend.fontSize;
        expect(Object.keys(fontSize).sort()).toEqual(
            ['body', 'body-sm', 'caption', 'display', 'title'].sort()
        );
    });

    it('exposes the zIndex scale', () => {
        const zIndex = tailwindConfig.theme.extend.zIndex;
        expect(zIndex).toMatchObject({
            nav: '10',
            fab: '20',
            sheet: '30',
            modal: '40',
            toast: '50',
            critical: '60'
        });
    });

    it('keeps the existing fontFamily.sans extension intact', () => {
        expect(tailwindConfig.theme.extend.fontFamily.sans).toContain('Inter');
    });
});

describe('design tokens: smoke render', () => {
    it('renders a node with the new utility classes without crashing', () => {
        const classes = 'bg-app-surface rounded-card text-body z-modal';
        const { container } = render(<div className={classes}>token smoke test</div>);
        const el = container.firstElementChild as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.className).toBe(classes);
    });
});
