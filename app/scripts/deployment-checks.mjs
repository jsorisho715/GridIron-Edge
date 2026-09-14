// Static assets and Worker HTML can propagate independently. Retry only the
// bounded loading window; never accept an HTML fallback as a JavaScript file.
export async function loadDeployedAsset(path, get, delay = () => new Promise(r => setTimeout(r, 5000))) {
  let last = 'unavailable';
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await get(path), type = response.headers.get('content-type') ?? '';
    const correctType = path.endsWith('.js') ? /(?:java|ecma)script/.test(type) : path.endsWith('.css') ? type.includes('text/css') : true;
    if (response.ok && correctType) return response;
    last = `HTTP ${response.status}${response.ok ? ' with an unexpected content type' : ''}`;
    await response.body?.cancel();
    if ([401,403].includes(response.status)) break;
    if (attempt < 7) await delay();
  }
  throw new Error(`A deployed asset failed to load after the rollout check: ${path} (${last}).`);
}
