import { useState } from 'react'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import type { Client } from '../../../shared/types'

type Status = Client['status']
const COLUMNS: { id: Status; label: string }[] = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'active', label: 'Active' },
  { id: 'review', label: 'Review' },
  { id: 'shipped', label: 'Shipped' },
]

function ClientCard({ client, onEdit }: { client: Client; onEdit: (c: Client) => void }) {
  return (
    <div className="crm-card" onClick={() => onEdit(client)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onEdit(client)}>
      <div className="crm-card-name">{client.name}</div>
      {client.url ? <div className="crm-card-url dim">{client.url}</div> : null}
      {client.niche ? <div className="crm-card-niche">{client.niche}</div> : null}
    </div>
  )
}

function ClientForm({ initial, onSave, onDelete, onClose }: { initial?: Client; onSave: (data: { name: string; url: string; niche: string; notes: string }) => void; onDelete?: () => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [niche, setNiche] = useState(initial?.niche ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  return (
    <Modal title={initial ? 'Edit client' : 'Add client'} onClose={onClose} narrow>
      <div className="field"><label className="field-label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div className="field"><label className="field-label">Website</label><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
      <div className="field"><label className="field-label">Niche</label><input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. SaaS, E-commerce" /></div>
      <div className="field"><label className="field-label">Notes</label><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="modal-foot">
        {onDelete ? <button className="btn danger flex-none" onClick={onDelete}>Delete</button> : null}
        <div style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave({ name, url, niche, notes })} disabled={!name.trim()}>Save</button>
      </div>
    </Modal>
  )
}

export function ClientsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)
  const clients: Client[] = snapshot?.clients ?? []
  const [editing, setEditing] = useState<Client | null | 'new'>(null)

  const handleSave = async (data: { name: string; url: string; niche: string; notes: string }) => {
    if (editing === 'new') {
      await guard(() => window.ventriee.clientCreate(data))
    } else if (editing) {
      await guard(() => window.ventriee.clientUpdate(editing.id, data))
    }
    setEditing(null)
  }

  const handleDelete = async () => {
    if (editing && editing !== 'new') {
      await guard(() => window.ventriee.clientDelete(editing.id))
    }
    setEditing(null)
  }

  const moveClient = async (client: Client, status: Status) => {
    await guard(() => window.ventriee.clientUpdate(client.id, { status }))
  }

  return (
    <Modal title="Clients" subtitle="Track prospects through the agency pipeline." onClose={onClose}>
      <div className="crm-toolbar">
        <button className="btn primary" onClick={() => setEditing('new')}>+ Add client</button>
      </div>
      <div className="crm-board">
        {COLUMNS.map((col) => (
          <div key={col.id} className="crm-col">
            <div className="crm-col-header">{col.label} <span className="dim">({clients.filter((c) => c.status === col.id).length})</span></div>
            {clients.filter((c) => c.status === col.id).map((c) => (
              <ClientCard key={c.id} client={c} onEdit={setEditing} />
            ))}
            {clients.filter((c) => c.status !== col.id).length > 0 ? null : null}
          </div>
        ))}
      </div>
      {editing === 'new' ? (
        <ClientForm onSave={handleSave} onClose={() => setEditing(null)} />
      ) : editing ? (
        <ClientForm
          initial={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Modal>
  )
}
