"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const HeroGridPattern = () => {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const ref = useRef<any>(null);
    const handleMouseMove = (event: any) => {
        const rect = ref.current && ref.current.getBoundingClientRect();
        setMousePosition({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        });
    };

    const size = 300;
    return (
        <div
            ref={ref}
            onMouseMove={handleMouseMove}
            className="h-full absolute inset-0"
        >
            <div className="absolute h-full inset-y-0 overflow-hidden w-full">
                <div
                    className="absolute inset-0 z-20 bg-transparent"
                    style={{
                        maskImage: `radial-gradient(
            ${size / 4}px circle at center,
           white, transparent
          )`,
                        WebkitMaskImage: `radial-gradient(
          ${size / 4}px circle at center,
          white, transparent
        )`,
                        WebkitMaskPosition: `${mousePosition.x - size / 2}px ${mousePosition.y - size / 2
                            }px`,
                        WebkitMaskSize: `${size}px`,
                        maskSize: `${size}px`,
                        pointerEvents: "none",
                        maskRepeat: "no-repeat",
                        WebkitMaskRepeat: "no-repeat",
                    }}
                >
                    <Pattern generateRandom={false} cellClassName="border-transparent dark:border-transparent relative z-[100]" />
                </div>
                <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]">
<Pattern
  className="opacity-[0.4]"
  cellClassName="border-neutral-400 dark:border-zinc-700"
/>
                </div>
            </div>
        </div>
    );
};

function Pattern({
    className,
    cellClassName,
    generateRandom = true,
}: {
    className?: string;
    cellClassName?: string;
    generateRandom?: boolean;
}) {
    const x = new Array(47).fill(0);
    const y = new Array(30).fill(0);
    const matrix = x.map((_, i) => y.map((_, j) => [i, j]));
    const [randomLit, setRandomLit] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!generateRandom) return;
        const totalRows = 47;
        const totalCols = 30;
        const count = 45;
        const newLit = new Set<string>();
        for (let k = 0; k < count; k++) {
            // Constrain to center area (approx middle 50%)
            // Rows: 47 total. Center ~23. Range 12-34.
            const minRow = 12;
            const maxRow = 34;
            // Cols: 30 total. Center ~15. Range 7-23.
            const minCol = 7;
            const maxCol = 23;

            const r = Math.floor(Math.random() * (maxRow - minRow + 1)) + minRow;
            const c = Math.floor(Math.random() * (maxCol - minCol + 1)) + minCol;
            newLit.add(`${r}-${c}`);
        }
        setRandomLit(newLit);
    }, []);

    return (
        <div className={cn("flex flex-row justify-center relative z-30", className)}>
            {matrix.map((row, rowIdx) => (
                <div
                    key={`matrix-row-${rowIdx}`}
                    className="flex flex-col relative z-20 border-b"
                >
                    {row.map((column, colIdx) => {
                        const isLit = randomLit.has(`${rowIdx}-${colIdx}`);

                        return (
                            <div
                                key={`matrix-col-${colIdx}`}
                                className={cn(
                                    "bg-transparent border-b-[1.7px] border-neutral-500 dark:border-zinc-700",
                                    rowIdx > 0 && "border-l-[1.7px]",
                                    cellClassName
                                )}
                            >
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={isLit ? { opacity: 1 } : { opacity: 0 }}
                                    whileHover={{ opacity: [0, 1, 0.5] }}
                                    transition={{ duration: 0.5, ease: "backOut" }}
                                    className="bg-zinc-400/30 dark:bg-neutral-500/30 h-10 w-10"
                                ></motion.div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
