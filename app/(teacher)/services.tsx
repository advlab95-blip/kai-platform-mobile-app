import React from 'react';
import { useTranslation } from 'react-i18next';
import ServicesGrid from '../../components/shared/ServicesGrid';
import TeacherInnerHero from '../../components/teacher/home/TeacherInnerHero';
import { tokens } from '../../constants/designTokens';

export default function TeacherServices() {
  const { t } = useTranslation();
  const title = t('common.services');
  // Settings moved out of the bottom nav (replaced by Schedule) — surface it
  // here so the teacher can still reach it from the Services hub.
  const extraItems = [
    {
      icon: 'settings',
      label: t('common.settings'),
      color: tokens.color.text3 || '#64748B',
      route: '/(teacher)/settings',
      group: 'أخرى',
      groupIcon: 'ellipsis-horizontal',
    },
  ];
  return (
    <ServicesGrid
      interfaceName="teacher"
      title={title}
      topSlot={<TeacherInnerHero title={title} showBack={false} />}
      extraItems={extraItems}
    />
  );
}
