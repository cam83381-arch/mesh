import { useState, useEffect } from 'react'
import type { Category } from './types'
import gun from './gun'

function useCategories(serverId: string) {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!serverId) {
      setCategories([])
      return
    }

    const catsRef: Record<string, Category> = {}

    const ref = gun.get('categories').get(serverId)
    ref.map().on((cat: any, id: string) => {
      if (!cat || !cat.name) {
        delete catsRef[id]
      } else {
        catsRef[id] = { ...cat, id }
      }
      setCategories(
        Object.values(catsRef).sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      )
    })

    return () => {
      ref.map().off()
    }
  }, [serverId])

  const createCategory = (name: string) => {
    if (!serverId || !name.trim()) return
    const id = Date.now().toString()
    const cat: Category = { id, name: name.trim(), serverId, position: categories.length }
    gun.get('categories').get(serverId).get(id).put(cat)
  }

  const renameCategory = (id: string, name: string) => {
    gun.get('categories').get(serverId).get(id).get('name').put(name)
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c))
  }

  const deleteCategory = (id: string) => {
    gun.get('categories').get(serverId).get(id).put(null)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return { categories, createCategory, renameCategory, deleteCategory }
}

export default useCategories
