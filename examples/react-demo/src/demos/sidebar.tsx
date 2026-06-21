import { useState } from "react";
import { Home, Inbox, Calendar, Search, Settings, ChevronRight } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarSeparator,
  SidebarInset,
} from "../ui/sidebar";

export const meta = {
  title: "Sidebar",
  description: "A scaled app shell: the glass sidebar panel refracts the grass while the content sits beside it.",
  minH: "min-h-[300px]",
};

const NAV = [
  { title: "Home", icon: Home },
  { title: "Inbox", icon: Inbox, badge: "5" },
  { title: "Calendar", icon: Calendar },
  { title: "Search", icon: Search },
];

export default function Demo() {
  const [active, setActive] = useState("Home");

  return (
    <div className="h-64 w-full overflow-hidden rounded-xl border border-white/30">
      {/* collapsible="none" keeps the sidebar a self-contained flex column so it
          fits the card instead of going fixed/full-viewport. */}
      <SidebarProvider className="!min-h-full h-full items-stretch">
        <Sidebar collapsible="none" className="w-44">
          <SidebarHeader>
            <div className="px-2 py-1 text-sm font-semibold [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
              Acme Inc
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={active === item.title}
                        onClick={() => setActive(item.title)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            <span>Acme</span>
            <ChevronRight className="size-3" />
            <span className="text-white">{active}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            {active}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            Pick an item on the left — the active row highlights and this panel follows.
          </p>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
