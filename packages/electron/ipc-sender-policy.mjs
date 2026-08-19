export const isLocalIpcSenderUrl = ({ rawUrl, uiProtocol, isDev, hmrUiPort, localOrigin, sidecarUrl }) => {
  try {
    if (!rawUrl) return false;
    const url = new URL(rawUrl);
    if (url.protocol === `${uiProtocol}:` && url.hostname === 'app') return true;
    if (isDev && url.origin === `http://127.0.0.1:${hmrUiPort}`) return true;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return [localOrigin, sidecarUrl].some((origin) => {
      try {
        return origin ? new URL(origin).origin === url.origin : false;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};
