"use client";

import React from "react";
import Image from "next/image";

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center px-4">
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* Animated sun rays */}
        <div className="absolute inset-0 animate-spin">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-0.5 h-3 bg-primary/60 rounded-full"
              style={{
                transform: `rotate(${i * 30}deg) translateX(-50%)`,
                transformOrigin: "center 32px",
              }}
            />
          ))}
        </div>

        {/* Center logo */}
        <div className="relative w-10 h-10 z-10 flex items-center justify-center bg-background rounded-full">
          <Image
            src="/logo.svg"
            alt="Loading"
            width={32}
            height={32}
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
};
