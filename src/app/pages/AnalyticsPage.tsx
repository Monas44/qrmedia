import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard';
import { PageHeader } from '../components/Layout';

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics geral" subtitle="Todos os links somados. Bots e previews de mensageiros ficam de fora por padrão." />
      <AnalyticsDashboard />
    </>
  );
}
