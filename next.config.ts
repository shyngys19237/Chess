import type { NextConfig } from "next";

const devOrigins = process.env.NEXT_PUBLIC_DEV_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins?.length ? devOrigins : undefined,
};

export default nextConfig;
