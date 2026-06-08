// Shape of public/CompanyInfo.md — the single file that re-brands the whole app.
// Schema is intentionally flat camelCase (parsed from YAML frontmatter via gray-matter).

export interface FontSpec {
  fontFamily: string;
  fontWeight: number;
}

export interface ColorPalette {
  bg: string;
  bgAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  darkBg: string;
  darkBgAlt: string;
  darkBorder: string;
  darkText: string;
  darkMuted: string;
  darkAccent: string;
  darkAccentSoft: string;
}

export interface StyleGuide {
  colors: ColorPalette;
  typography: {
    display: FontSpec;
    heading: FontSpec;
    body: FontSpec;
  };
  rounded: { sm: string; md: string; lg: string };
  spacing: { xs: string; sm: string; md: string; lg: string; xl: string };
}

export interface CompanyInfo {
  companyName: string;
  dashboardName: string;
  adminContact: { email: string; phone: string };
  logo: string;
  styleGuide: StyleGuide;
  about: string;
  /** Optional display-name overrides keyed by APP_REGISTRY id, e.g. { tasks: "DohDocs" }. */
  appNames?: Record<string, string>;
}
