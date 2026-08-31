import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  dir?: "row" | "column" | "row-reverse" | "column-reverse";
  justify?: "start" | "end" | "center" | "between" | "around" | "evenly";
  items?: "start" | "end" | "center" | "baseline" | "stretch";
  gap?: number;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({ dir = "row", justify, items, gap, className, children, ...props }, ref) => {
    const directionClass = {
      row: "flex-row",
      column: "flex-col",
      "row-reverse": "flex-row-reverse",
      "column-reverse": "flex-col-reverse",
    }[dir];

    const justifyClass = justify
      ? {
          start: "justify-start",
          end: "justify-end",
          center: "justify-center",
          between: "justify-between",
          around: "justify-around",
          evenly: "justify-evenly",
        }[justify]
      : undefined;

    const itemsClass = items
      ? {
          start: "items-start",
          end: "items-end",
          center: "items-center",
          baseline: "items-baseline",
          stretch: "items-stretch",
        }[items]
      : undefined;

    const gapClass = gap !== undefined ? `gap-${gap}` : undefined;

    return (
      <div
        ref={ref}
        className={cn("flex", directionClass, justifyClass, itemsClass, gapClass, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Stack.displayName = "Stack";
