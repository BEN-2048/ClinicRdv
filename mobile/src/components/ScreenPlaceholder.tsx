import React from 'react';
import { EmptyState, Screen } from './ui';

export default function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <Screen safeTop>
      <EmptyState icon="screwdriver-wrench" title={title} message="Cet écran sera bientôt disponible." />
    </Screen>
  );
}
