import {
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  Handshake,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import type { AppIconName } from "@/config/nav";

export const appIcons: Record<AppIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  requests: ClipboardList,
  placements: Handshake,
  payments: CreditCard,
  settings: Settings,
  workers: Users,
  inbox: Inbox,
  billing: Receipt,
  agencies: Building2,
  audit: ScrollText,
  alerts: BellRing,
};
