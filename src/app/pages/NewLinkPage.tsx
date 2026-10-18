import { Link, useNavigate } from 'react-router-dom';
import type { LinkDTO } from '@shared/types';
import { PageHeader } from '../components/Layout';
import { initialValues, LinkForm, toPayload } from '../components/LinkForm';
import { Card, Icon } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAppConfig } from '../lib/config';

export function NewLinkPage() {
  const navigate = useNavigate();
  const { base_url } = useAppConfig();

  return (
    <>
      <PageHeader
        back={
          <Link to="/" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <Icon name="back" className="size-4" /> Links
          </Link>
        }
        title="Novo link"
        subtitle="O QR code aponta para a URL curta; o destino pode mudar depois."
      />
      <Card className="max-w-3xl">
        <LinkForm
          mode="create"
          baseUrl={base_url}
          initial={initialValues()}
          submitLabel="Criar link"
          onSubmit={async (values) => {
            try {
              const link = await api.post<LinkDTO>('/links', toPayload(values, true));
              navigate(`/links/${link.id}?tab=qr`, { replace: true });
            } catch (err) {
              throw new Error(errorMessage(err));
            }
          }}
        />
      </Card>
    </>
  );
}
