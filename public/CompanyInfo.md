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
    bgAlt: "#f7f8fa"
    border: "#e2e4e8"
    text: "#1f2328"
    muted: "#5f6368"
    accent: "#2563eb"
    accentSoft: "#e8f0fe"
    error: "#dc2626"
    darkBg: "#1e1f22"
    darkBgAlt: "#16171a"
    darkBorder: "#34363b"
    darkText: "#e6e7e9"
    darkMuted: "#9aa0a6"
    darkAccent: "#6ea8ff"
    darkAccentSoft: "#2a3550"
    darkError: "#f07070"
  typography:
    display:
      fontFamily: "Comfortaa, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontWeight: 700
    heading:
      fontFamily: "Comfortaa, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      fontWeight: 700
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
