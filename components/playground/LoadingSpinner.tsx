"use client";

import React, { useId } from "react";

const AnimatedPlaygroundLogo = () => {
  const clipId = useId().replace(/:/g, "");

  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 256 256"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Loading"
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="208" width="60" height="8">
            <animate attributeName="y" values="208;40;40" keyTimes="0;0.25;1" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="height" values="8;176;176" keyTimes="0;0.25;1" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="width" values="60;60;256" keyTimes="0;0.25;1" dur="1.6s" repeatCount="indefinite" />
          </rect>
        </clipPath>
      </defs>

      <g fill="#d30000" clipPath={`url(#${clipId})`}>
        <path d="M58 47 L128 77 L198 47" fill="none" stroke="#d30000" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="51" y="40" width="14" height="176" rx="7" />
        <rect x="121" y="70" width="14" height="94" rx="7" />
        <rect x="191" y="40" width="14" height="96" rx="7" />
      </g>
    </svg>
  );
};

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center px-4">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <AnimatedPlaygroundLogo />
      </div>
    </div>
  );
};
