import { Capacitor, registerPlugin } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const Native = registerPlugin('SmartPgNative');
