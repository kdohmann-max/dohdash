// Code-defined registry of the v1 placeholder apps. Each is a nav stub —
// app_access.app_id (see migration 0002) stores these string ids, and
// AppStubPage looks entries up by :appId route param. Not a DB table:
// v1 apps aren't dynamic, so there's nothing to gain from persisting this.

import type { CompanyInfo } from "../company/types";

export interface AppDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  route: string;
}

export const APP_REGISTRY: AppDef[] = [
  {
    id: "job-files",
    name: "Job Files",
    icon: "📁",
    description: "Browse and manage job-related documents and folders.",
    route: "/dashboard/app/job-files",
  },
  {
    id: "tasks",
    name: "Tasks",
    icon: "✅",
    description: "Track to-dos and assignments across the team.",
    route: "/dashboard/app/tasks",
  },
  {
    id: "calendar",
    name: "Calendar",
    icon: "📅",
    description: "See upcoming events, deadlines, and schedules.",
    route: "/dashboard/app/calendar",
  },
  {
    id: "contacts",
    name: "Contacts",
    icon: "👥",
    description: "Look up coworkers, clients, and vendor contacts.",
    route: "/dashboard/app/contacts",
  },
  {
    id: "time-tracker",
    name: "Time Tracker",
    icon: "⏱️",
    description: "Log hours worked against jobs and projects.",
    route: "/dashboard/app/time-tracker",
  },
  {
    id: "expense-tracker",
    name: "Expense Tracker",
    icon: "💰",
    description: "Submit and review expense reports.",
    route: "/dashboard/app/expense-tracker",
  },
  {
    id: "clean-up",
    name: "Clean Up",
    icon: "🧹",
    description: "Coordinate cleaning schedules and checklists.",
    route: "/dashboard/app/clean-up",
  },
];

export function getAppDef(appId: string): AppDef | undefined {
  return APP_REGISTRY.find((app) => app.id === appId);
}

/** Display name for an app — CompanyInfo.md's `appNames` map can override the registry default per-deployment (e.g. renaming "Tasks" to "DohDocs"). */
export function resolveAppName(app: AppDef, companyInfo: CompanyInfo | null): string {
  return companyInfo?.appNames?.[app.id] ?? app.name;
}
