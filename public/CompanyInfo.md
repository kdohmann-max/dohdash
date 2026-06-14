---
companyName: "Doh Built Inc."
dashboardName: "DohDash"
adminContact:
  email: "kdohmann@gmail.com"
  phone: "+1 (780) 555-0142"
logo: "/company-logo.png"
appNames:
  tasks: "DohDocs"
styleGuide:
  colors:
    bg: "#ffffff"
    bgAlt: "#f9f8f6"
    border: "#e8e4df"
    text: "#1f2328"
    muted: "#6b6b6b"
    accent: "#c86c2e"
    accentSoft: "#fef3ee"
    accentSecondary: "#1e40af"
    accentTertiary: "#fbbf24"
    error: "#dc2626"
    darkBg: "#1a1a1a"
    darkBgAlt: "#242424"
    darkBorder: "#3a3a3a"
    darkText: "#e8e8e8"
    darkMuted: "#ababab"
    darkAccent: "#f08d5d"
    darkAccentSoft: "#5a3426"
    darkAccentSecondary: "#3b82f6"
    darkAccentTertiary: "#f59e0b"
    darkError: "#f07070"
  typography:
    display:
      fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontWeight: 700
    heading:
      fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontWeight: 600
    body:
      fontFamily: "Comfortaa, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontWeight: 400
  rounded:
    sm: "4px"
    md: "6px"
    lg: "8px"
  spacing:
    xs: "4px"
    sm: "8px"
    md: "12px"
    lg: "16px"
    xl: "32px"
---

# Doh Built Inc. — Company Info

## About

Doh Built Inc. is a small construction and field-services company. DohDash is
our internal company OS: the one place employees sign in to reach the tools
they use day to day — job files, tasks, the calendar, contacts, time tracking,
expenses, and clean-up scheduling.

## Admin contact

Questions about account access should go to the admin contact above. New
employees won't be able to sign in until an admin grants them access.

## Porting this dashboard to another company

Everything above the `## About` heading is read at runtime — change the
company name, contact info, logo path, and colors here (plus the Supabase
project credentials in the deploy environment) and the entire dashboard
re-brands without touching any source code or rebuilding.
