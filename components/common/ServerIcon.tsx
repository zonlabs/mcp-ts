'use client';

import { useState } from 'react';

interface ServerIconProps {
  serverName: string;
  serverUrl?: string | null;
  size?: number;
  className?: string;
  showFallback?: boolean;
  fallbackImage?: string;
}

export function ServerIcon({
  serverName,
  serverUrl,
  size = 24,
  className = '',
  showFallback = true,
  fallbackImage,
}: ServerIconProps) {
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  // Extract root domain from URL (e.g., mcp.supabase.com -> supabase.com)
  const getDomainFromUrl = (url?: string | null): string | null => {
    if (!url) return null;

    try {
      // Handle various URL formats
      let urlString = url.trim();

      // Add protocol if missing
      if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `https://${urlString}`;
      }

      const urlObj = new URL(urlString);
      let hostname = urlObj.hostname;

      // Remove 'www.' prefix if present
      hostname = hostname.replace(/^www\./, '');

      // Extract root domain (last 2 parts of hostname)
      // Examples:
      // - mcp.supabase.com -> supabase.com
      // - server.smithery.ai -> smithery.ai
      // - media-aggregator.fastmcp.app -> fastmcp.app
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.');
      }
      return hostname;
    } catch (error) {
      // Fallback: try to extract domain with regex
      // Match the last two parts (domain.tld) from the URL
      const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:[^.\/]+\.)*([^.\/]+\.[^.\/]+)/);
      return domainMatch ? domainMatch[1] : null;
    }
  };

  const domain = getDomainFromUrl(serverUrl);
  const firstLetter = serverName.charAt(0).toUpperCase();

  // Generate a consistent color based on server name
  const getColorFromName = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-cyan-500',
      'bg-teal-500',
      'bg-orange-500',
      'bg-red-500',
      'bg-yellow-500',
    ];

    return colors[Math.abs(hash) % colors.length];
  };

  // If we have a domain and no error, show the favicon
  if (domain && !faviconError) {
    const faviconSize = Math.max(256, size * 4);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=${faviconSize}`;
    return (
      <img
        src={faviconUrl}
        alt={`${serverName} favicon`}
        className={className}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(e) => {
          setFaviconError(true);
        }}
      />
    );
  }

  // If custom fallback image is provided, use it (when favicon fails or no domain)
  if (fallbackImage && showFallback && !fallbackError) {
    return (
      <img
        src={fallbackImage}
        alt={`${serverName} icon`}
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(e) => {
          setFallbackError(true);
        }}
      />
    );
  }

  // Fallback to first letter with colored background
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

  // No fallback - just return null
  return null;
}
