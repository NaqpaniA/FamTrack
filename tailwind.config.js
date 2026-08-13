/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.tsx', './*.ts'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
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
      },
      borderRadius: {
        control: '12px',
        card: '18px',
        sheet: '24px'
      },
      fontSize: {
        caption: ['11px', '14px'],
        'body-sm': ['13px', '18px'],
        body: ['15px', '20px'],
        title: ['17px', '22px'],
        display: ['24px', '30px']
      },
      zIndex: {
        nav: '10',
        fab: '20',
        sheet: '30',
        modal: '40',
        toast: '50',
        critical: '60'
      }
    }
  },
  plugins: []
};
