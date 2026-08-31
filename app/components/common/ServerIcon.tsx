"use client";

import * as React from 'react';
import { useState } from 'react';

interface ServerIconProps {
  serverName: string;
  serverUrl?: string | null;
  icon?: string | null;
  size?: number;
  className?: string;
  showFallback?: boolean;
  fallbackImage?: string;
}

export function ServerIcon({
  serverName,
  serverUrl,
  icon,
  size = 24,
  className = '',
  showFallback = true,
  fallbackImage,
}: ServerIconProps) {
  const [error, setError] = useState(false);
  const [iconError, setIconError] = useState(false);

  React.useEffect(() => {
    setError(false);
    setIconError(false);
  }, [serverUrl, serverName, icon]);

  // If an explicit icon is provided (URL or inline SVG), render it first
  if (icon && !iconError) {
    if (typeof icon === "string" && icon.trim().startsWith("<svg")) {
      return (
        <span
          className={className}
          style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: icon }}
        />
      );
    }

    return (
      <img
        key={`icon:${icon}`}
        src={icon}
        alt={`${serverName} icon`}
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setIconError(true)}
      />
    );
  }

  const getHostname = (url?: string | null): string | null => {
    if (!url) return null;
    try {
      let urlString = url.trim();
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `https://${urlString}`;
      }
      const urlObj = new URL(urlString);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const hostname = getHostname(serverUrl);
  const firstLetter = serverName.charAt(0).toUpperCase();

  const getColorFromName = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-cyan-500', 'bg-teal-500', 'bg-orange-500',
      'bg-red-500', 'bg-yellow-500',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  // Try favicon via server proxy (avoids CORS/third-party cookies)
  if (hostname && !error) {
    return (
      <img
        key={`fav:${hostname}`}
        src={`/api/favicon?hostname=${encodeURIComponent(hostname)}`}
        alt={`${serverName} favicon`}
        className={className}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setError(true)}

      />
    );
  }

  // Custom fallback image
  if (fallbackImage && showFallback) {
    return (
      <img
        key={`fallback:${fallbackImage}`}
        src={fallbackImage}
        alt={`${serverName} icon`}
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }

  // Letter fallback
  if (showFallback) {
    return (
      <div
        className={`${getColorFromName(serverName)} ${className} flex items-center justify-center text-white font-semibold border-0`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          borderRadius: className.includes('rounded') ? undefined : '0.5rem',
        }}
      >
        {firstLetter}
      </div>
    );
  }

  return null;
}
