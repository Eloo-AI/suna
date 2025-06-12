import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isFlagEnabled } from '@/lib/feature-flags';

export const metadata: Metadata = {
      title: 'Create Agent | Eloo AI',
    description: 'Interactive agent playground powered by Eloo AI',
  openGraph: {
          title: 'Agent Playground | Eloo AI',
      description: 'Interactive agent playground powered by Eloo AI',
    type: 'website',
  },
};

export default async function NewAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agentPlaygroundEnabled = await isFlagEnabled('custom_agents');
  if (!agentPlaygroundEnabled) {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
