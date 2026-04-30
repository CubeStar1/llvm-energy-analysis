import Icons from "@/components/global/icons";
import { SidebarConfig } from "@/components/global/app-sidebar";

const sidebarConfig: SidebarConfig = {
  brand: {
    title: "LLVM",
    icon: Icons.bot,
    href: "/"
  },
  sections: [
    {
      label: "LLVM",
      items: [
        {
          title: "Analyze",
          href: "/analyze",
          icon: Icons.folder
        },
      ]
    },
    {
      label: "Settings",
      items: [
        {
          title: "Compiler",
          href: "/settings",
          icon: Icons.settings
        }
      ]
    }
  ]
}

export default sidebarConfig