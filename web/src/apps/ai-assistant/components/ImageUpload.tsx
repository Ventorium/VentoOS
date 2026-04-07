import { ImagePlus, X } from 'lucide-react'
import { type DragEvent, useCallback, useRef, useState } from 'react'

interface ImageUploadProps {
  images: string[]
  onChange: (images: string[]) => void
  disabled?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export default function ImageUpload({ images, onChange, disabled }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addImages = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(isImageFile)
      if (imageFiles.length === 0) return
      const base64Images = await Promise.all(imageFiles.map(fileToBase64))
      onChange([...images, ...base64Images])
    },
    [images, onChange]
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      void addImages(files)
    },
    [addImages]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      void addImages(files)
      if (inputRef.current) inputRef.current.value = ''
    },
    [addImages]
  )

  const removeImage = useCallback(
    (index: number) => {
      onChange(images.filter((_, i) => i !== index))
    },
    [images, onChange]
  )

  return (
    <div>
      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative w-12 h-12 rounded overflow-hidden group">
              <img src={img} alt={`upload-${i}`} className="w-full h-full object-cover" />
              <button
                type="button"
                className="absolute top-0 right-0 w-4 h-4 rounded-full flex items-center justify-center border-none cursor-pointer hidden group-hover:flex"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                onClick={() => removeImage(i)}
              >
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / button */}
      <div className="inline-flex" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
        <button
          type="button"
          className="flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer"
          style={{
            background: isDragging ? 'var(--vos-bg-item-hover)' : 'transparent',
            color: 'var(--vos-text-tertiary)'
          }}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          title="上传图片"
        >
          <ImagePlus size={14} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
      </div>
    </div>
  )
}
