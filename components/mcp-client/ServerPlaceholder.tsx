"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Server, Zap, Activity, Grid, Search, RadioTower } from "lucide-react";
import Logo from "../common/Logo";

interface ServerPlaceholderProps {
  type: "no-selection" | "no-servers";
  tab?: "public" | "user";
}

export function ServerPlaceholder({ type, tab }: ServerPlaceholderProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  if (type === "no-selection") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 min-h-[calc(100vh-120px)] bg-gray-50/30 dark:bg-transparent">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-3xl w-full"
        >
          {/* Hero Section */}
          <motion.div variants={itemVariants} className="text-center mb-6 sm:mb-8">
            <div className="relative h-12 w-12 sm:h-16 sm:w-16 mx-auto">
              <Logo size={50} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 my-2 tracking-tight">
              Welcome to MCP Assistant
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              Select a server from the sidebar to explore its capabilities, inspect tools, and monitor connections.
            </p>
          </motion.div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            <FeatureCard
              variants={itemVariants}
              icon={<Grid className="w-5 h-5 text-blue-500" />}
              title="Explore Tools"
              description="Browse and test available tools from connected servers interactively."
            />
            <FeatureCard
              variants={itemVariants}
              icon={<Activity className="w-5 h-5 text-green-500" />}
              title="Monitor Health"
              description="Real-time connection status validation and health checking."
            />
            <FeatureCard
              variants={itemVariants}
              icon={<Zap className="w-5 h-5 text-amber-500" />}
              title="Execute Actions"
              description="Run tools directly from the interface and see results instantly."
            />
          </div>

          <motion.div variants={itemVariants} className="mt-6 sm:mt-8 flex justify-center">
            <Link
              href="/gateway"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <RadioTower className="h-4 w-4" />
              Open Gateway Manager
            </Link>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // No Servers - User Tab
  if (type === "no-servers" && tab === "user") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="bg-muted/50 p-4 rounded-full mb-4">
          <Server className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <h3 className="text-base font-semibold mb-2">No Personal Servers</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6 leading-relaxed">
          You haven't connected any custom servers yet. Add a local or remote server to get started.
        </p>
      </div>
    );
  }

  // No Servers - Public Tab (or generic)
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="bg-muted/50 p-4 rounded-full mb-4">
        <Search className="h-8 w-8 text-muted-foreground/70" />
      </div>
      <h3 className="text-base font-semibold mb-2">No Public Servers Found</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        We couldn't find any public servers matching your criteria. Try adjusting your filters.
      </p>
    </div>
  );
}

// Helper component for feature cards
function FeatureCard({ icon, title, description, variants }: { icon: React.ReactNode, title: string, description: string, variants: any }) {
  return (
    <motion.div variants={variants}>
      <div className="h-full p-4 sm:p-6 text-center">
        <div className="mb-4 inline-flex p-2.5">
          {icon}
        </div>
        <h3 className="mb-2 text-sm font-semibold text-foreground/90">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  )
}


