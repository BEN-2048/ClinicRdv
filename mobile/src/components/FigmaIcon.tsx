import React from 'react';
import { LocalSvg } from 'react-native-svg/css';

const icons = {
  'wl-calendar-off': { asset: require('../../assets/figma/wl-calendar-off.svg'), width: 12, height: 13.3333 },
  'wl-info-bell': { asset: require('../../assets/figma/wl-info-bell.svg'), width: 16.6667, height: 16.7083 },
  'wl-push': { asset: require('../../assets/figma/wl-push.svg'), width: 12, height: 15 },
  'wl-sms': { asset: require('../../assets/figma/wl-sms.svg'), width: 15, height: 15 },
  'wl-cta-bell': { asset: require('../../assets/figma/wl-cta-bell.svg'), width: 13.3333, height: 16.6667 },
  'wl-shield': { asset: require('../../assets/figma/wl-shield.svg'), width: 9.33333, height: 11.6667 },
  'appt-search': { asset: require('../../assets/figma/appt-search.svg'), width: 15, height: 15 },
  'appt-filter': { asset: require('../../assets/figma/appt-filter.svg'), width: 15, height: 15 },
  'appt-timer': { asset: require('../../assets/figma/appt-timer.svg'), width: 11.25, height: 13.125 },
  'appt-calendar': { asset: require('../../assets/figma/appt-calendar.svg'), width: 13.5, height: 15 },
  'appt-calendar-pending': { asset: require('../../assets/figma/appt-calendar-pending.svg'), width: 15, height: 15 },
  'appt-motif': { asset: require('../../assets/figma/appt-motif.svg'), width: 15, height: 15 },
  'appt-motif-pending': { asset: require('../../assets/figma/appt-motif-pending.svg'), width: 15, height: 16.5 },
  'appt-reschedule': { asset: require('../../assets/figma/appt-reschedule.svg'), width: 15.75, height: 16.5 },
  'appt-cancel': { asset: require('../../assets/figma/appt-cancel.svg'), width: 13.5, height: 15 },
  'appt-cancel-pending': { asset: require('../../assets/figma/appt-cancel-pending.svg'), width: 10.5, height: 10.5 },
  'appt-alert-bell': { asset: require('../../assets/figma/appt-alert-bell.svg'), width: 20, height: 20.05 },
  'appt-arrow': { asset: require('../../assets/figma/appt-arrow.svg'), width: 9.33333, height: 9.33333 },
  'appt-info': { asset: require('../../assets/figma/appt-info.svg'), width: 16.6667, height: 16.6667 },
  'appt-plus': { asset: require('../../assets/figma/appt-plus.svg'), width: 12.8333, height: 12.8333 },
  'header-bell': { asset: require('../../assets/figma/header-bell.svg'), width: 16, height: 20 },
  'tab-home-active': { asset: require('../../assets/figma/tab-home-active.svg'), width: 16, height: 18 },
  'tab-home-inactive': { asset: require('../../assets/figma/tab-home-inactive.svg'), width: 16, height: 18 },
  'tab-doctors-active': { asset: require('../../assets/figma/tab-doctors-active.svg'), width: 20, height: 20 },
  'tab-doctors-inactive': { asset: require('../../assets/figma/tab-doctors-inactive.svg'), width: 20, height: 20 },
  'tab-appointments-active': { asset: require('../../assets/figma/tab-appointments-active.svg'), width: 18, height: 20 },
  'tab-appointments-inactive': { asset: require('../../assets/figma/tab-appointments-inactive.svg'), width: 18, height: 20 },
  'tab-profile-active': { asset: require('../../assets/figma/tab-profile-active.svg'), width: 16, height: 16 },
  'tab-profile-inactive': { asset: require('../../assets/figma/tab-profile-inactive.svg'), width: 16, height: 16 },
} as const;

export type FigmaIconName = keyof typeof icons;

export default function FigmaIcon({ name }: { name: FigmaIconName }) {
  const icon = icons[name];
  return <LocalSvg asset={icon.asset} width={icon.width} height={icon.height} />;
}
