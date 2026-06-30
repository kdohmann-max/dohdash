import { lazy, type ComponentType, type ReactElement } from "react";
import type { CompanyInfo } from "../company/types";
import { AppStubPage } from "./AppStubPage";
import {
  JobFilesIcon,
  TasksIcon,
  CalendarIcon,
  ContactsIcon,
  TimeTrackerIcon,
  TimeDashboardIcon,
  ExpensesIcon,
  CleanUpIcon,
  ChickenScratchIcon,
  FractionCalculatorIcon,
  RemoteClaudeIcon,
} from "../icons";

// Functional apps are lazy-loaded so their heavy deps (TipTap for DohDocs, the
// Gemini path for Chicken Scratch) stay out of the launcher's initial bundle.
// React.lazy needs a default export; these apps are named exports, so map them.
const TasksApp = lazy(() => import("./tasks/TasksApp").then((m) => ({ default: m.TasksApp })));
const TimeTrackerApp = lazy(() => import("./time-tracker/TimeTrackerApp").then((m) => ({ default: m.TimeTrackerApp })));
const TimeDashboardApp = lazy(() => import("./time-dashboard/TimeDashboardApp").then((m) => ({ default: m.TimeDashboardApp })));
const ChickenScratchApp = lazy(() =>
  import("./chicken-scratch/ChickenScratchApp").then((m) => ({ default: m.ChickenScratchApp })),
);
const FractionCalculatorApp = lazy(() =>
  import("./fraction-calculator/FractionCalculatorApp").then((m) => ({ default: m.FractionCalculatorApp })),
);
const RemoteClaudeApp = lazy(() =>
  import("./remote-claude/RemoteClaudeApp").then((m) => ({ default: m.RemoteClaudeApp })),
);

export interface AppDef {
  id: string;
  name: string;
  /** App icon element from `src/icons`; accepts a `size` prop (launcher resizes it via cloneElement). */
  icon: ReactElement<{ size?: number }>;
  description: string;
  route: string;
  /** Root component rendered at the app's route. Stubs use `AppStubPage`. */
  component: ComponentType;
  /** Drives launcher treatment + whether a real app mounts vs. the placeholder. */
  status: "functional" | "stub";
}

export const APP_REGISTRY: AppDef[] = [
  {
    id: "job-files",
    name: "Job Files",
    icon: <JobFilesIcon />,
    description: "Browse and manage job-related documents and folders.",
    route: "/dashboard/app/job-files",
    component: AppStubPage,
    status: "stub",
  },
  {
    id: "tasks",
    name: "Tasks",
    icon: <TasksIcon />,
    description: "Track to-dos and assignments across the team.",
    route: "/dashboard/app/tasks",
    component: TasksApp,
    status: "functional",
  },
  {
    id: "calendar",
    name: "Calendar",
    icon: <CalendarIcon />,
    description: "See upcoming events, deadlines, and schedules.",
    route: "/dashboard/app/calendar",
    component: AppStubPage,
    status: "stub",
  },
  {
    id: "contacts",
    name: "Contacts",
    icon: <ContactsIcon />,
    description: "Look up coworkers, clients, and vendor contacts.",
    route: "/dashboard/app/contacts",
    component: AppStubPage,
    status: "stub",
  },
  {
    id: "time-tracker",
    name: "Time Tracker",
    icon: <TimeTrackerIcon />,
    description: "Log hours worked against jobs and projects.",
    route: "/dashboard/app/time-tracker",
    component: TimeTrackerApp,
    status: "functional",
  },
  {
    id: "time-dashboard",
    name: "Time Dashboard",
    icon: <TimeDashboardIcon />,
    description: "Review, rate, and export everyone's logged time.",
    route: "/dashboard/app/time-dashboard",
    component: TimeDashboardApp,
    status: "functional",
  },
  {
    id: "expense-tracker",
    name: "Expense Tracker",
    icon: <ExpensesIcon />,
    description: "Submit and review expense reports.",
    route: "/dashboard/app/expense-tracker",
    component: AppStubPage,
    status: "stub",
  },
  {
    id: "clean-up",
    name: "Clean Up",
    icon: <CleanUpIcon />,
    description: "Coordinate cleaning schedules and checklists.",
    route: "/dashboard/app/clean-up",
    component: AppStubPage,
    status: "stub",
  },
  {
    id: "chicken-scratch",
    name: "Chicken Scratch",
    icon: <ChickenScratchIcon />,
    description: "Convert handwriting and sketches into clean digital text and diagrams.",
    route: "/dashboard/app/chicken-scratch",
    component: ChickenScratchApp,
    status: "functional",
  },
  {
    id: "fraction-calculator",
    name: "Fraction Calculator",
    icon: <FractionCalculatorIcon />,
    description: "Calculate with fractions, decimals, and measurements.",
    route: "/dashboard/app/fraction-calculator",
    component: FractionCalculatorApp,
    status: "functional",
  },
  {
    id: "remote-claude",
    name: "Remote Claude",
    icon: <RemoteClaudeIcon />,
    description: "Start a remote Claude Code session on your PC from your phone.",
    route: "/dashboard/app/remote-claude",
    component: RemoteClaudeApp,
    status: "functional",
  },
];

export function getAppDef(appId: string): AppDef | undefined {
  return APP_REGISTRY.find((app) => app.id === appId);
}

/** Display name for an app — CompanyInfo.md's `appNames` map can override the registry default per-deployment (e.g. renaming "Tasks" to "DohDocs"). */
export function resolveAppName(app: AppDef, companyInfo: CompanyInfo | null): string {
  return companyInfo?.appNames?.[app.id] ?? app.name;
}

/** True if the app is enabled for the tenant. Undefined/null enabledApps = all enabled (backward compat). */
export function isTenantAppEnabled(appId: string, enabledApps?: string[] | null): boolean {
  if (!enabledApps) return true;
  return enabledApps.includes(appId);
}
