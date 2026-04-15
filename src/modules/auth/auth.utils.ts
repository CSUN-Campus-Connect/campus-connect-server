/**
 * Auth utils 
 * Utility functions for parsing user agent strings into readable labels
 * and resolving IP addresses to apporximate locations for login history and session management
 */

export const parseUserAgent = (ua: string): string => {
  const browser =
    ua.includes("Edg/") ? "Edge" :
    ua.includes("Chrome/") ? "Chrome" :
    ua.includes("Firefox/") ? "Firefox" :
    ua.includes("Safari/") && !ua.includes("Chrome") ? "Safari" :
    "Unknown browser";

  const os =
    ua.includes("Windows") ? "Windows" :
    ua.includes("Mac OS X") ? "Mac" :
    ua.includes("Android") ? "Android" :
    ua.includes("iPhone") || ua.includes("iPad") ? "iOS" :
    ua.includes("Linux") ? "Linux" :
    "Unknown OS";

  return `${browser} on ${os}`;
};

export const getLocationFromIp = async (ip: string): Promise<string | null> => {
  try {
    const cleanIp = ip.replace("::ffff:", "");
    const response = await fetch(`http://ip-api.com/json/${cleanIp}`);
    const data = await response.json() as { status: string; city: string; regionName: string };

    if (data.status === "success") {
      return `${data.city}, ${data.regionName}`;
    }
    return null;
  } catch {
    return null;
  }
};