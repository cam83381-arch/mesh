/**
 * GifPicker.tsx — Vrai picker GIF via Tenor API v2
 * Clé demo publique Google/Tenor (usage limité, pour dev/prod léger)
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const TENOR_KEY = (import.meta.env.VITE_TENOR_KEY as string) || 'LIVDSRZULELA'
const TENOR_BASE = 'https://tenor.googleapis.com/v2'
const LIMIT = 24

// Catégories tendance avec terme de recherche associé
const CATEGORIES = [
  { label: '🔥 Tendance',  query: '' },          // featured
  { label: '😂 LOL',       query: 'lol funny' },
  { label: '👋 Salut',     query: 'hello wave' },
  { label: '❤️ Love',      query: 'love heart' },
  { label: '😤 Rage',      query: 'angry rage' },
  { label: '🎉 Fête',      query: 'party celebrate' },
  { label: '🐱 Animaux',   query: 'cute animals' },
  { label: '🎮 Gaming',    query: 'gaming win' },
  { label: '🧠 Big Brain', query: 'smart think' },
]

interface TenorGif {
  id: string
  title: string
  url: string       // URL du GIF à afficher
  preview: string   // tiny preview (tinygif)
  width: number
  height: number
}

function parseTenorResults(data: any): TenorGif[] {
  if (!data?.results) return []
  return data.results.map((r: any) => {
    const med = r.media_formats || {}
    const gif = med.tinygif || med.gif || med.mediumgif || {}
    const preview = med.nanogif || med.tinygif || {}
    return {
      id: r.id,
      title: r.title || '',
      url: gif.url || '',
      preview: preview.url || gif.url || '',
      width: gif.dims?.[0] || 100,
      height: gif.dims?.[1] || 100,
    }
  }).filter((g: TenorGif) => g.url)
}

async function fetchTenor(endpoint: string, params: Record<string, string>): Promise<TenorGif[]> {
  const url = new URL(`${TENOR_BASE}/${endpoint}`)
  url.searchParams.set('key', TENOR_KEY)
  url.searchParams.set('limit', String(LIMIT))
  url.searchParams.set('media_filter', 'tinygif,nanogif')
  url.searchParams.set('contentfilter', 'medium')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Tenor ${res.status}`)
  return parseTenorResults(await res.json())
}

interface Props {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState(0)
  const [gifs, setGifs] = useState<TenorGif[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q: string, catIndex: number) => {
    setLoading(true)
    setError('')
    setGifs([])
    try {
      let results: TenorGif[]
      if (q.trim()) {
        results = await fetchTenor('search', { q: q.trim() })
      } else {
        const catQuery = CATEGORIES[catIndex].query
        if (catQuery) {
          results = await fetchTenor('search', { q: catQuery })
        } else {
          results = await fetchTenor('featured', {})
        }
      }
      setGifs(results)
    } catch (e: any) {
      setError('Impossible de charger les GIFs. Vérifie ta connexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Chargement initial
  useEffect(() => {
    load('', activeCat)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Changement de catégorie
  const handleCatChange = (i: number) => {
    setActiveCat(i)
    setQuery('')
    load('', i)
  }

  // Recherche avec debounce 400ms
  const handleSearch = (val: string) => {
    setQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      load(val, activeCat)
    }, 400)
  }

  return (
    <div className="gif-picker">
      {/* Header recherche */}
      <div className="gif-picker-header">
        <input
          className="gif-search-input"
          placeholder="🔍 Rechercher un GIF…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
        />
        <button className="gif-close-btn" onClick={onClose} title="Fermer">✕</button>
      </div>

      {/* Catégories */}
      {!query && (
        <div className="gif-categories">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              className={`gif-cat-btn${activeCat === i ? ' active' : ''}`}
              onClick={() => handleCatChange(i)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Grille GIFs */}
      <div className="gif-body">
        {loading && (
          <div className="gif-status">
            <div className="gif-loading-dots">
              <span/><span/><span/>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="gif-status gif-error">{error}</div>
        )}
        {!loading && !error && gifs.length === 0 && (
          <div className="gif-status">Aucun GIF trouvé{query ? ` pour "${query}"` : ''}</div>
        )}
        {!loading && gifs.length > 0 && (
          <div className="gif-grid">
            {gifs.map(gif => (
              <button
                key={gif.id}
                className="gif-item"
                onClick={() => { onSelect(gif.url); onClose() }}
                title={gif.title || 'GIF'}
              >
                <img
                  src={gif.preview}
                  alt={gif.title}
                  loading="lazy"
                  className="gif-item-img"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="gif-footer">
        <img
          src="https://tenor.com/assets/img/badges/tenor-badge-9x3.svg"
          alt="Powered by Tenor"
          className="gif-tenor-badge"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      </div>
    </div>
  )
}

export default GifPicker
