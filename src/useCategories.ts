import { useState, useEffect } from 'react'
import type { Category } from './types'
import { readLocal, writeLocal } from './localStore'
import { joinMeshRoom } from './mesh'

const FILE = 'categories.json'

async function loadCats(serverId: string): Promise<Record<string, Category>> {
  const data = await readLocal<Record<string, Record<string, Category>>>(FILE) || {}
  return data[serverId] || {}
}

async function saveCats(serverId: string, cats: Record<string, Category>) {
  const data = await readLocal<Record<string, Record<string, Category>>>(FILE) || {}
  data[serverId] = cats
  await writeLocal(FILE, data)
}

function useCategories(serverId: string) {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!serverId) { setCategories([]); return }
    let active = true

    const sortCats = (cats: Record<string, Category>) =>
      Object.values(cats).sort((a: any, b: any) => (a.position || 0) - (b.position || 0))

    // 1. Charger depuis localStore
    loadCats(serverId).then(cats => {
      if (!active) return
      setCategories(sortCats(cats))
    })

    // 2. Sync Trystero — recevoir les categories des autres membres
    const room = joinMeshRoom(`categories_${serverId}`)
    if (room) {
      const [sendCat, getCat] = (room.makeAction as any)('category_update') as [any, any]

      getCat(async (cat: any) => {
        if (!active || !cat?.id) return
        const cats = await loadCats(serverId)
        if (cat._deleted) {
          delete cats[cat.id]
        } else {
          cats[cat.id] = cat
        }
        await saveCats(serverId, cats)
        setCategories(sortCats(cats))
      })

      // Quand un nouveau pair rejoint, lui envoyer toutes nos categories
      room.onPeerJoin(async () => {
        if (!active) return
        const cats = await loadCats(serverId)
        Object.values(cats).forEach(cat => {
          try { sendCat(cat) } catch (_e) {}
        })
      })
    }

    return () => { active = false }
  }, [serverId])

  const createCategory = async (name: string) => {
    if (!serverId || !name.trim()) return
    const id = Date.now().toString()
    const cat: Category = { id, name: name.trim(), serverId, position: categories.length }
    const cats = await loadCats(serverId)
    cats[id] = cat
    await saveCats(serverId, cats)
    setCategories(Object.values(cats).sort((a: any, b: any) => (a.position || 0) - (b.position || 0)))

    // Diffuser aux pairs
    const room = joinMeshRoom(`categories_${serverId}`)
    if (room) {
      const [sendCat] = (room.makeAction as any)('category_update') as [any, any]
      try { sendCat(cat) } catch (_e) {}
    }
  }

  const renameCategory = async (id: string, name: string) => {
    const cats = await loadCats(serverId)
    if (!cats[id]) return
    cats[id] = { ...cats[id], name }
    await saveCats(serverId, cats)
    setCategories(Object.values(cats).sort((a: any, b: any) => (a.position || 0) - (b.position || 0)))

    const room = joinMeshRoom(`categories_${serverId}`)
    if (room) {
      const [sendCat] = (room.makeAction as any)('category_update') as [any, any]
      try { sendCat(cats[id]) } catch (_e) {}
    }
  }

  const deleteCategory = async (id: string) => {
    const cats = await loadCats(serverId)
    const deleted = cats[id]
    delete cats[id]
    await saveCats(serverId, cats)
    setCategories(Object.values(cats).sort((a: any, b: any) => (a.position || 0) - (b.position || 0)))

    if (deleted) {
      const room = joinMeshRoom(`categories_${serverId}`)
      if (room) {
        const [sendCat] = (room.makeAction as any)('category_update') as [any, any]
        try { sendCat({ ...deleted, _deleted: true }) } catch (_e) {}
      }
    }
  }

  return { categories, createCategory, renameCategory, deleteCategory }
}

export default useCategories
