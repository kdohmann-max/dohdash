import type { ReactNode } from "react";
import type { CompanyInfo } from "../company/types";
import {
  JobFilesIcon,
  TasksIcon,
  CalendarIcon,
  ContactsIcon,
  TimeTrackerIcon,
  ExpensesIcon,
  CleanUpIcon,
  ChickenScratchIcon,
  FractionCalculatorIcon,
} from "../icons";

export interface AppDef {
  id: string;
  name: string;
  icon: ReactNode;
  description: string;
  route: string;
}

export const APP_REGISTRY: AppDef[] = [
  {
    id: "job-files",
    name: "Job Files",
    icon: <JobFilesIcon />,
    description: "Browse and manage job-related documents and folders.",
    route: "/dashboard/app/job-files",
  },
  {
    id: "tasks",
    name: "Tasks",
    icon: <TasksIcon />,
    description: "Track to-dos and assignments across the team.",
    route: "/dashboard/app/tasks",
  },
  {
    id: "calendar",
    name: "Calendar",
    icon: <CalendarIcon />,
    description: "See upcoming events, deadlines, and schedules.",
    route: "/dashboard/app/calendar",
  },
  {
    id: "contacts",
    name: "Contacts",
    icon: <ContactsIcon />,
    description: "Look up coworkers, clients, and vendor contacts.",
    route: "/dashboard/app/contacts",
  },
  {
    id: "time-tracker",
    name: "Time Tracker",
    icon: <TimeTrackerIcon />,
    description: "Log hours worked against jobs and projects.",
    route: "/dashboard/app/time-tracker",
  },
  {
    id: "expense-tracker",
    name: "Expense Tracker",
    icon: <ExpensesIcon />,
    description: "Submit and review expense reports.",
    route: "/dashboard/app/expense-tracker",
  },
  {
    id: "clean-up",
    name: "Clean Up",
    icon: <CleanUpIcon />,
    description: "Coordinate cleaning schedules and checklists.",
    route: "/dashboard/app/clean-up",
  },
  {
    id: "chicken-scratch",
    name: "Chicken Scratch",
    icon: <ChickenScratchIcon />,
    description: "Convert handwriting and sketches into clean digital text and diagrams.",
    route: "/dashboard/app/chicken-scratch",
  },
  {
    id: "fraction-calculator",
    name: "Fraction Calculator",
    icon: <FractionCalculatorIcon />,
    description: "Calculate with fractions, decimals, and measurements.",
    route: "/dashboard/app/fraction-calculator",
  },
];

export function getAppDef(appId: string): AppDef | undefined {
  return APP_REGISTRY.find((app) => app.id === appId);
}

/** Display name for an app — CompanyInfo.md's `appNames` map can override the registry default per-deployment (e.g. renaming "Tasks" to "DohDocs"). */
export function resolveAppName(app: AppDef, companyInfo: CompanyInfo | null): string {
  return companyInfo?.appNames?.[app.id] ?? app.name;
}
