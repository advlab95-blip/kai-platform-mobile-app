import React from 'react';
import { useTranslation } from 'react-i18next';
import ServicesGrid from '../../components/shared/ServicesGrid';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';

export default function StudentServices() {
  const { t } = useTranslation();
  const title = t('common.services');
  return (
    <ServicesGrid
      interfaceName="student"
      title={title}
      topSlot={
        <RoleInnerHero
          title={title}
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
          showBack={false}
        />
      }
      // Schedule moved out of the bottom tab → ensure it's reachable from
      // the services hub. Deduped by route so it only appears once even if
      // a future migration adds it to the catalog.
      extraItems={[
        {
          icon: 'calendar',
          label: t('common.schedule', { defaultValue: 'الجدول' }),
          color: tokens.color.teal600,
          route: '/(student)/schedule',
        },
      ]}
    />
  );
}
