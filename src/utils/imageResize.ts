/**
 * Redimensionne une image côté client et retourne un data URL base64
 * Limite la taille pour ne pas saturer GunDB (max ~150KB)
 */
export function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img

        // Calculer les dimensions finales en conservant le ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width  = Math.round(width  * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        // JPEG pour photos, PNG pour images avec transparence
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        resolve(canvas.toDataURL(mime, quality))
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}
