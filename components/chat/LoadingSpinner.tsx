"use client";

import React from "react";

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center px-1 py-1.5" role="status" aria-label="Loading">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="currentColor"
        className="text-foreground"
      >
        <style>{`
          @keyframes matrixDot {
            0%, 100% { opacity: 0.2; }
            20% { opacity: 1; }
            40% { opacity: 0.7; }
            60% { opacity: 0.2; }
          }
          .m-1 { animation: matrixDot 1.4s infinite ease-in-out 0.00s; }
          .m-2 { animation: matrixDot 1.4s infinite ease-in-out 0.15s; }
          .m-3 { animation: matrixDot 1.4s infinite ease-in-out 0.30s; }
          .m-4 { animation: matrixDot 1.4s infinite ease-in-out 0.45s; }
          .m-5 { animation: matrixDot 1.4s infinite ease-in-out 0.60s; }
          .m-6 { animation: matrixDot 1.4s infinite ease-in-out 0.75s; }
          .m-7 { animation: matrixDot 1.4s infinite ease-in-out 0.90s; }
          .m-8 { animation: matrixDot 1.4s infinite ease-in-out 1.05s; }
          .m-center { opacity: 0.2; }
        `}</style>
        {/* Row 1 */}
        <circle cx="3" cy="3" r="1.8" className="m-1" />
        <circle cx="9" cy="3" r="1.8" className="m-2" />
        <circle cx="15" cy="3" r="1.8" className="m-3" />
        {/* Row 2 */}
        <circle cx="3" cy="9" r="1.8" className="m-8" />
        <circle cx="9" cy="9" r="1.8" className="m-center" />
        <circle cx="15" cy="9" r="1.8" className="m-4" />
        {/* Row 3 */}
        <circle cx="3" cy="15" r="1.8" className="m-7" />
        <circle cx="9" cy="15" r="1.8" className="m-6" />
        <circle cx="15" cy="15" r="1.8" className="m-5" />
      </svg>
    </div>
  );
};
