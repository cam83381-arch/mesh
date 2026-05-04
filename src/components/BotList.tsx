/**
 * BotList.tsx — Liste des bots du serveur
 *
 * Persistance : localStore bots.json
 * GunDB : ZÉRO utilisation — supprimé
 */

import { useState, useEffect } from 'react'
import { readLocal, writeLocal } from '../localStore'

interface BotEntry {
  id: string
  name: string
  active: boolean
  lastRun?: number
}

interface Props {
  serverId: string
  onEditBot: (botId: string | null) => void  // null = new bot
}

function BotList({ serverId, onEditBot }: Props) {
  const [bots, setBots] = useState<BotEntry[]>([])

  // Charger les bots depuis localStore
  useEffect(() => {
    if (!serverId) return
    let active = true

    const load = async () => {
      const data = await readLocal<Record<string, Record<string, any>>>('bots.json')
      if (!active) return
      const serverBots = data?.[serverId] || {}
      const list: BotEntry[] = Object.values(serverBots)
        .filter((b: any) => b?.id)
        .map((b: any) => ({ id: b.id, name: b.name || 'Sans nom', active: !!b.active, lastRun: b.lastRun }))
        .sort((a, b) => a.name.localeCompare(b.name))
      setBots(list)
    }
    load()

    return () => { active = false }
  }, [serverId])

  const deleteBot = async (botId: string) => {
    if (!confirm('Supprimer ce bot ?')) return
    const data = await readLocal<Record<string, Record<string, any>>>('bots.json') || {}
    if (data[serverId]) {
      delete data[serverId][botId]
      await writeLocal('bots.json', data)
      setBots(prev => prev.filter(b => b.id !== botId))
    }
  }

  const toggleActive = async (bot: BotEntry) => {
    const data = await readLocal<Record<string, Record<string, any>>>('bots.json') || {}
    if (data[serverId]?.[bot.id]) {
      data[serverId][bot.id].active = !bot.active
      await writeLocal('bots.json', data)
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, active: !bot.active } : b))
    }
  }

  return (
    <div className="bot-list">
      <div className="bot-list-header">
        <h3 className="bot-list-title">🤖 Bots du serveur</h3>
        <button className="bot-list-create-btn" onClick={() => onEditBot(null)}>
          + Créer un bot
        </button>
      </div>

      {bots.length === 0 ? (
        <div className="bot-list-empty">
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
          <div style={{ fontWeight: 600, color: '#dbdee1', marginBottom: '6px' }}>Aucun bot configuré</div>
          <div style={{ color: '#949ba4', fontSize: '13px' }}>Crée ton premier bot pour automatiser des actions sur ce serveur.</div>
        </div>
      ) : (
        <div className="bot-list-cards">
          {bots.map(bot => (
            <div key={bot.id} className="bot-card">
              <div className="bot-card-avatar" style={{ background: bot.active ? '#23a559' : '#4e5058' }}>
                🤖
              </div>
              <div className="bot-card-info">
                <div className="bot-card-name">{bot.name}</div>
                <div className="bot-card-status">
                  <span className={`bot-status-dot ${bot.active ? 'active' : 'inactive'}`} />
                  <span style={{ fontSize: '12px', color: '#949ba4' }}>
                    {bot.active ? 'Actif' : 'Inactif'}
                    {bot.lastRun ? ` · Dernière exécution : ${new Date(bot.lastRun).toLocaleString('fr-FR')}` : ''}
                  </span>
                </div>
              </div>
              <div className="bot-card-actions">
                <button
                  className={`bot-card-btn toggle ${bot.active ? 'on' : 'off'}`}
                  onClick={() => toggleActive(bot)}
                  title={bot.active ? 'Désactiver' : 'Activer'}
                >
                  {bot.active ? '🟢' : '⚫'}
                </button>
                <button className="bot-card-btn edit" onClick={() => onEditBot(bot.id)} title="Modifier">✏️</button>
                <button className="bot-card-btn delete" onClick={() => deleteBot(bot.id)} title="Supprimer">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default BotList
