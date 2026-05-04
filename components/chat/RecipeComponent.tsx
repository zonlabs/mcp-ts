import React from "react";

const RECIPE_DATA = [
  {
    id: "composio-email-summary",
    title: "Email Summary",
    description: "Using Composio MCP to get access to Gmail, check my unread emails from today and summarize the important ones",
    icons: ["https://logos.composio.dev/api/gmail"],
  },
  {
    id: "web-search",
    title: "Semantic Search",
    description: "Search the web using Exa to find the latest research papers on LLM optimization from the past month.",
    icons: ["https://awsmp-logos.s3.amazonaws.com/seller-7s5a3z2w3unay/b6519f9126c0432087c79827b95283c6.png"],
  },
  {
    id: "github-issue-summary",
    title: "GitHub Issue Summary",
    description: "Use Composio MCP to get access to Github to fetch the latest open issues for this repository and summarize the most critical bugs.",
    icons: ["https://logos.composio.dev/api/github"],
  },
  {
    id: "supabase-project",
    title: "Supabase Project",
    description: "You help users manage Supabase projects and databases. Assist with projects, tables, migrations, SQL, and troubleshooting while following Supabase best practices. Use documentation and project context to provide accurate, safe, and actionable guidance.",
    icons: ["https://github.com/supabase.png"],
  },
  {
    id: "notion-meeting-prep",
    title: "Notion Meeting Prep",
    description: "Generate a briefing document by synthesizing project notes and recent updates directly from Notion.",
    icons: [
      "https://api.iconify.design/logos:notion-icon.svg",
    ],
  },
  {
    id: "stock-research",
    title: "Market Analysis",
    description: "Use Alpha Vantage to fetch the last 30 days of daily prices for {TICKER}. Summarize whether the price trend is up, down, or flat.",
    icons: [
      "https://media.licdn.com/dms/image/v2/C4E0BAQExXHCGjZYOeg/company-logo_200_200/company-logo_200_200/0/1635279005628/alpha_vantage_inc_logo?e=2147483647&v=beta&t=1eCKMzXdgp4XiMrzN4edDUCqMdUSHQ9nx5nXjD8RQ3Q",
    ],
  },
];
interface Props {
  onAction: (text: string) => void;
}

export const RecipeComponent: React.FC<Props> = ({ onAction }) => {
  return (
    <div className="grid sm:grid-cols-3 gap-2 max-w-4xl mx-auto">
      {RECIPE_DATA.map((item) => (
        <button
          key={item.id}
          onClick={() => onAction(item.description)}
          className="
            group relative text-left
            h-[96px]
            rounded-lg border border-zinc-200 dark:border-white/10
            bg-white dark:bg-zinc-900/70
            px-4 py-3
            flex flex-col justify-between
            hover:bg-zinc-50 dark:hover:bg-zinc-800/70
            hover:border-zinc-300 dark:hover:border-white/20
            transition-all
          "
        >
          {/* Icons */}
          <div className="absolute top-3 right-3 flex gap-1">
            {item.icons.map((icon, i) => (
              <img
                key={i}
                src={icon}
                className="w-6 h-6 opacity-70 group-hover:opacity-100"
                alt=""
              />
            ))}
          </div>

          {/* Content */}
          <div className="pr-10">
            <h3 className="text-[15px] text-zinc-900 dark:text-white leading-tight">
              {item.title}
            </h3>
            <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2">
              {item.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
};
