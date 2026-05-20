import React from 'react';
import ServicesGrid from '../../components/shared/ServicesGrid';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { useTranslation } from 'react-i18next';

export default function AdminServices() {
  const { t } = useTranslation();
  const title = t('common.services');
  return (
    <ServicesGrid
      interfaceName="admin"
      title={title}
      topSlot={
        <RoleInnerHero
          title={title}
          gradient={tokens.gradient.brand}
          glowAccent="rgba(59,130,246,0.30)"
          showBack={false}
        />
      }
    />
  );
}
