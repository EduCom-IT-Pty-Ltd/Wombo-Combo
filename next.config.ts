import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Document uploads are relayed through a server action, and the default
      // ceiling is 1 MB — below the 4 MB the upload itself allows, so a drawing
      // would be refused by the framework before the action ever ran. Set just
      // above `MAX_DOCUMENT_BYTES` to leave room for the rest of the form.
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
