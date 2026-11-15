import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NightWatch · Prototype evaluation', description: 'Measure detection and tracking under degraded visibility.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
