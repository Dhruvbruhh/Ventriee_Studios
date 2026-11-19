import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { guard } from '../store'

type Item = { path: string; url: string; name: string }

/** Images pasted, dropped or picked into a composer. They are saved in the project so agents can open them. */
export function useAttachments(projectId: string | undefined) {
  const [items, setItems] = useState<Item[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const add = async (files: File[]) => {
    for (const file of files.filter((f) => f.type.startsWith('image/')).slice(0, 4 - items.length)) {
      if (!projectId) return
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
      const path = await guard(async () => window.ventriee.attachmentSave(projectId, file.name.includes('.') ? file.name : `image.${ext}`, new Uint8Array(await file.arrayBuffer())))
      if (path) setItems((list) => [...list, { path, url: URL.createObjectURL(file), name: file.name || 'image' }].slice(0, 4))
    }
  }
  const remove = (path: string) => setItems((list) => { list.filter((i) => i.path === path).forEach((i) => URL.revokeObjectURL(i.url)); return list.filter((i) => i.path !== path) })
  const images = (e: { files: FileList }) => [...e.files].filter((f) => f.type.startsWith('image/'))
  return {
    paths: items.map((i) => i.path),
    clear: () => { items.forEach((i) => URL.revokeObjectURL(i.url)); setItems([]) },
    /** Spread onto the textarea. */
    handlers: {
      onPaste: (e: ClipboardEvent) => { const files = images(e.clipboardData); if (files.length) { e.preventDefault(); void add(files) } },
      onDrop: (e: DragEvent) => { const files = images(e.dataTransfer); if (files.length) { e.preventDefault(); void add(files) } },
      onDragOver: (e: DragEvent) => { if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) e.preventDefault() }
    },
    button: <>
      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} />
      <button type="button" className="btn tiny" disabled={!projectId || items.length >= 4} onClick={() => picker.current?.click()} aria-label="Attach an image" title="Attach an image (or paste / drop one)">Image</button>
    </>,
    strip: items.length ? <div className="attach-strip" aria-label="Attached images">{items.map((i) => <figure key={i.path}>
      <img src={i.url} alt={i.name} />
      <button type="button" className="attach-remove" aria-label={`Remove ${i.name}`} onClick={() => remove(i.path)}>×</button>
    </figure>)}</div> : null
  }
}
