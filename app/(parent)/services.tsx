import React from 'react';
import { useTranslation } from 'react-i18next';
import ServicesGrid from '../../components/shared/ServicesGrid';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';

export default function ParentServices() {
  const { t } = useTranslation();
  const title = t('common.services');
  return (
    <ServicesGrid
      interfaceName="parent"
      title={title}
      topSlot={
        <RoleInnerHero
          title={title}
          gradient={tokens.gradient.parent}
          glowAccent="rgba(167,139,250,0.30)"
          showBack={false}
        />
      }
    />
  );
}
