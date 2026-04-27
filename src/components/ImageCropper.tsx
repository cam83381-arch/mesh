import React, { useState, useRef, useEffect, useCallback } from 'react'

interface Props {
  src: string
  aspect: number          // width/height e.g. 1 for avatar, 3 for banner
  outputW: number
  outputH: number
  quality?: number
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
}

export default function ImageCropper({ src, aspect, outputW, outputH, quality = 0.85, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Zone de crop = toujours previewW x previewH (ce qui sera exporté)
  const cropW = aspect >= 2 ? 480 : 240
  const cropH = Math.round(cropW / aspect)

  // Canvas plus grand : marge de 60px autour de la zone de crop pour voir le contexte
  const MARGIN = 60
  const canvasW = cropW + MARGIN * 2
  const canvasH = cropH + MARGIN * 2

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Scale initial = couvrir exactement la zone de crop
      const initScale = Math.max(cropW / img.naturalWidth, cropH / img.naturalHeight)
      setScale(initScale)
      setOffset({ x: 0, y: 0 })
    }
    img.src = src
  }, [src, cropW, cropH])

  // Scale minimum = 30% de fit (on peut voir bien en dehors de la zone)
  const getMinScale = () => {
    const img = imgRef.current
    if (!img) return 0.1
    return Math.min(cropW / img.naturalWidth, cropH / img.naturalHeight) * 0.3
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasW, canvasH)

    // Dessiner l'image dans le repère du canvas (décalé de MARGIN)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    // Centre de la zone de crop dans le canvas = MARGIN + cropW/2, MARGIN + cropH/2
    const imgX = MARGIN + (cropW - w) / 2 + offset.x
    const imgY = MARGIN + (cropH - h) / 2 + offset.y
    ctx.drawImage(img, imgX, imgY, w, h)

    // Overlay sombre sur la zone hors crop
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    // Top
    ctx.fillRect(0, 0, canvasW, MARGIN)
    // Bottom
    ctx.fillRect(0, MARGIN + cropH, canvasW, MARGIN)
    // Left
    ctx.fillRect(0, MARGIN, MARGIN, cropH)
    // Right
    ctx.fillRect(MARGIN + cropW, MARGIN, MARGIN, cropH)
    ctx.restore()

    // Cadre lumineux autour de la zone de crop
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(MARGIN, MARGIN, cropW, cropH)

    // Lignes de tiers (règle des tiers) — légères
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    const t1x = MARGIN + cropW / 3
    const t2x = MARGIN + (cropW * 2) / 3
    const t1y = MARGIN + cropH / 3
    const t2y = MARGIN + (cropH * 2) / 3
    ctx.beginPath()
    ctx.moveTo(t1x, MARGIN); ctx.lineTo(t1x, MARGIN + cropH)
    ctx.moveTo(t2x, MARGIN); ctx.lineTo(t2x, MARGIN + cropH)
    ctx.moveTo(MARGIN, t1y); ctx.lineTo(MARGIN + cropW, t1y)
    ctx.moveTo(MARGIN, t2y); ctx.lineTo(MARGIN + cropW, t2y)
    ctx.stroke()

    // Coins renforcés
    ctx.strokeStyle = 'rgba(255,255,255,1)'
    ctx.lineWidth = 3
    const cs = 16
    ctx.beginPath()
    // Top-left
    ctx.moveTo(MARGIN, MARGIN + cs); ctx.lineTo(MARGIN, MARGIN); ctx.lineTo(MARGIN + cs, MARGIN)
    // Top-right
    ctx.moveTo(MARGIN + cropW - cs, MARGIN); ctx.lineTo(MARGIN + cropW, MARGIN); ctx.lineTo(MARGIN + cropW, MARGIN + cs)
    // Bottom-left
    ctx.moveTo(MARGIN, MARGIN + cropH - cs); ctx.lineTo(MARGIN, MARGIN + cropH); ctx.lineTo(MARGIN + cs, MARGIN + cropH)
    // Bottom-right
    ctx.moveTo(MARGIN + cropW - cs, MARGIN + cropH); ctx.lineTo(MARGIN + cropW, MARGIN + cropH); ctx.lineTo(MARGIN + cropW, MARGIN + cropH - cs)
    ctx.stroke()

    ctx.restore()
  }, [scale, offset, cropW, cropH, canvasW, canvasH, MARGIN])

  useEffect(() => { draw() }, [draw])

  const clampOffset = (ox: number, oy: number, sc: number) => {
    const img = imgRef.current
    if (!img) return { x: ox, y: oy }
    const w = img.naturalWidth * sc
    const h = img.naturalHeight * sc
    const maxX = Math.max(cropW / 2, (w + cropW) / 2) + MARGIN
    const maxY = Math.max(cropH / 2, (h + cropH) / 2) + MARGIN
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy))
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
  }

  const handleMouseUp = () => { dragStart.current = null }

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const img = imgRef.current
    if (!img) return
    const minScale = getMinScale()
    const coverScale = Math.max(cropW / img.naturalWidth, cropH / img.naturalHeight)
    const maxScale = coverScale * 4
    const newScale = minScale + (parseFloat(e.target.value) / 100) * (maxScale - minScale)
    const clamped = clampOffset(offset.x, offset.y, newScale)
    setScale(newScale)
    setOffset(clamped)
  }

  const getScalePercent = () => {
    const img = imgRef.current
    if (!img) return 30
    const minScale = getMinScale()
    const coverScale = Math.max(cropW / img.naturalWidth, cropH / img.naturalHeight)
    const maxScale = coverScale * 4
    return Math.round(((scale - minScale) / (maxScale - minScale)) * 100)
  }

  const handleConfirm = () => {
    const img = imgRef.current
    if (!img) return
    const out = document.createElement('canvas')
    out.width = outputW
    out.height = outputH
    const ctx = out.getContext('2d')
    if (!ctx) return
    // Exporter uniquement la zone de crop (sans les marges)
    const scaleRatio = outputW / cropW
    const w = img.naturalWidth * scale * scaleRatio
    const h = img.naturalHeight * scale * scaleRatio
    const x = (outputW - w) / 2 + offset.x * scaleRatio
    const y = (outputH - h) / 2 + offset.y * scaleRatio
    ctx.drawImage(img, x, y, w, h)
    const fmt = src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
    onConfirm(out.toDataURL(fmt, quality))
  }

  return (
    <div
      className="cropper-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="cropper-modal">
        <div className="cropper-title">Recadrer l'image</div>
        <div className="cropper-hint">Glisse pour repositionner · La zone encadrée sera utilisée</div>
        <div
          className="cropper-canvas-wrap"
          style={{ width: canvasW, height: canvasH, cursor: 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} width={canvasW} height={canvasH} />
        </div>
        <div className="cropper-zoom-row">
          <span className="cropper-zoom-label">Zoom</span>
          <input
            type="range"
            min="0"
            max="100"
            value={getScalePercent()}
            onChange={handleScaleChange}
            className="cropper-zoom-slider"
          />
          <span className="cropper-zoom-label">{getScalePercent()}%</span>
        </div>
        <div className="cropper-actions">
          <button className="cropper-btn ghost" onClick={onCancel}>Annuler</button>
          <button className="cropper-btn primary" onClick={handleConfirm}>Appliquer</button>
        </div>
      </div>
    </div>
  )
}
