import { Layers, Sparkles, BookOpen } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "../ui/navigation-menu";

export const meta = {
  title: "Navigation Menu",
  description: "A glass menu bar whose flyout panel flips open over the page.",
  minH: "min-h-[260px]",
};

const components = [
  { title: "Buttons", href: "#", desc: "Refractive emphasis variants.", icon: Sparkles },
  { title: "Cards", href: "#", desc: "Composed glass surfaces.", icon: Layers },
  { title: "Docs", href: "#", desc: "Guides and API reference.", icon: BookOpen },
];

export default function Demo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-1 p-1">
              {components.map(({ title, href, desc, icon: Icon }) => (
                <li key={title}>
                  <NavigationMenuLink href={href}>
                    <div className="flex items-center gap-2 font-medium">
                      <Icon /> {title}
                    </div>
                    <p className="text-xs text-white/70">{desc}</p>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            Pricing
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
