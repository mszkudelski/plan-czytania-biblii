export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isIosSafariBrowser(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  const isIos = isIosDevice(userAgent, platform, maxTouchPoints);
  const isWebKit = /AppleWebKit/i.test(userAgent);
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

  return isIos && isWebKit && !isOtherIosBrowser;
}

export function isStandaloneApp(
  displayModeStandalone: boolean,
  navigatorStandalone: boolean,
) {
  return displayModeStandalone || navigatorStandalone;
}

export function isMobileDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}
