import { useState } from 'react';
import type { LeagueTeam } from '../../lib/football';
import { trashTalk, type RoastTone } from '../../lib/trash-talk';

export function TrashTalk({ team }: { team: LeagueTeam }) {
  const [tone, setTone] = useState<RoastTone>('sharp');
  const [index, setIndex] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const lines = trashTalk(team, tone);
  const draft = edit ?? lines[index % lines.length];
  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(draft);
      setStatus('Copied. Paste it into your league chat.');
    } catch {
      setStatus('Copy unavailable. Select the message and copy it manually.');
    } finally { setCopying(false); }
  }
  return <details className="ge-card gi-trash-talk">
    <summary>Talk trash <span>Keep it about football.</span></summary>
    <div className="gi-trash-body">
      <label htmlFor="roast-tone">How spicy?</label>
      <select id="roast-tone" value={tone} disabled={copying} onChange={e => { setTone(e.target.value as RoastTone); setIndex(0); setEdit(null); setStatus(''); }}>
        <option value="sharp">Sharp</option><option value="spicy">Extra spicy · mild swearing</option>
      </select>
      <label htmlFor="roast-draft">Your message to {team.name}</label>
      <textarea id="roast-draft" value={draft} maxLength={1000} disabled={copying} onChange={e => { setEdit(e.target.value); setStatus(''); }} />
      <div className="ge-actions">
        <button className="ge-button" disabled={copying || !draft.trim()} onClick={copy}>{copying ? 'Copying…' : 'Copy message'}</button>
        <button className="ge-button secondary" disabled={copying} onClick={() => { setIndex(i => (i + 1) % lines.length); setEdit(null); setStatus(''); }}>Another roast</button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <p className="ge-footnote">Edit it before copying. Nothing sends automatically. Zero AI tokens.</p>
    </div>
  </details>;
}
