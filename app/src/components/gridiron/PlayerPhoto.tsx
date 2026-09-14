import { useState } from 'react';
import type { LeaguePlayer } from '../../lib/football';

export function PlayerPhoto({ player, large = false }: { player: Pick<LeaguePlayer, 'id' | 'name' | 'position' | 'proTeam'>; large?: boolean }) {
  const [failed, setFailed] = useState('');
  // ESPN athlete ID is shared by its public NFL headshot CDN. Defenses are teams.
  const src = player.position !== 'DST' && /^\d+$/.test(player.id)
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png` : '';
  const initials = player.position === 'DST' ? player.proTeam : player.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
  return <span className={'gi-photo' + (large ? ' gi-photo-large' : '')} aria-hidden="true">
    <span>{initials}</span>{src && failed !== src && <img key={src} src={src} alt="" width={large ? 104 : 48} height={large ? 104 : 48}
      loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" onLoad={e => e.currentTarget.classList.add('gi-photo-loaded')} onError={() => setFailed(src)} />}
  </span>;
}
