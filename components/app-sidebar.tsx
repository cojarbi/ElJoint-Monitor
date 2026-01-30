"use client"

import * as React from "react"
import {
  BookOpen,
  Bot,
  Command,
  Frame,
  LifeBuoy,
  Map,
  PieChart,
  Send,
  Settings2,
  SquareTerminal,
  FileText,
  Database,
  BarChart,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
  user: {
    name: "Admin",
    email: "ayahni@gmail.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Staffless",
      logo: Command,
      plan: "Pro",
    },
  ],
  navMain: [
    {
      title: "Data Input",
      url: "/data-input",
      icon: Database,
    },
    {
      title: "Agents",
      url: "/agents",
      icon: Bot,
      items: [
        {
          title: "Monitor",
          url: "/agents/monitor",
        },
        {
          title: "Budget",
          url: "/agents/budget",
        },
        {
          title: "Insertion Log",
          url: "/agents/insertion-log",
        },
      ],
    },
    {
      title: "Reports",
      url: "/reports",
      icon: BarChart,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
