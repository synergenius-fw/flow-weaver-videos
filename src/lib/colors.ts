export const COLORS = {
  teal: { dark: '#4dc7be', light: '#3db0a8' },
  blue: { dark: '#5e9eff', light: '#548ce3' },
  purple: { dark: '#b36bff', light: '#9f5fe3' },
  indigo: { dark: '#818cf8', light: '#6366f1' },
  green: { dark: '#10e15a', light: '#0ec850' },
  lime: { dark: '#a3e635', light: '#84cc16' },
  orange: { dark: '#ff8133', light: '#e3732d' },
  cyan: { dark: '#6fe5dc', light: '#63ccc4' },
  yellow: { dark: '#ffbd30', light: '#e3a82b' },
  rose: { dark: '#f472b6', light: '#e3639e' },
} as const;

export function dark(color: { dark: string; light: string }): string {
  return color.dark;
}
