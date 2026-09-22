export function isIosSafariBrowser(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  const isIos =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
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
