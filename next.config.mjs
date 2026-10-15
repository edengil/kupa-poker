/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // מעברי מסך חלקים בין טאבים (React ViewTransition) — נוסף 2026-10-16
  experimental: { viewTransition: true },
};
export default nextConfig;
