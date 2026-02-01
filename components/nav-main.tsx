"use client"

import * as React from "react"
import Link from "next/link"

import { usePathname } from "next/navigation"

import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const pathname = usePathname()
  const [openStates, setOpenStates] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    const savedStates = localStorage.getItem("sidebar-nav-main-states")
    if (savedStates) {
      setOpenStates(JSON.parse(savedStates))
    }
  }, [])

  const handleOpenChange = (title: string, open: boolean) => {
    const newStates = { ...openStates, [title]: open }
    setOpenStates(newStates)
    localStorage.setItem("sidebar-nav-main-states", JSON.stringify(newStates))
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          // Check for exact match or if it's a parent of the current path (optional, depending on desired behavior)
          // Here we stick to exact match for the link, but highlight parent if child is active
          const normalizePath = (path: string) => path.replace(/\/$/, "")
          const currentPath = normalizePath(pathname)
          const itemPath = normalizePath(item.url)

          const isActive = currentPath === itemPath
          const isChildActive = item.items?.some((subItem) => normalizePath(subItem.url) === currentPath)

          return item.items && item.items.length > 0 ? (
            <Collapsible
              key={item.title}
              asChild
              open={openStates[item.title] ?? (isActive || isChildActive)}
              onOpenChange={(open) => handleOpenChange(item.title, open)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={isActive || isChildActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild isActive={normalizePath(subItem.url) === currentPath}>
                          <Link href={subItem.url}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                <Link href={item.url}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
