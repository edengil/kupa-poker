/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ניסוי F — דגל מעברי המסך (experimental.viewTransition) כובה זמנית
  // לאבחון קריסת עמוד הבעלים באייפון (החזרה של d6983d5).
};
export default nextConfig;
