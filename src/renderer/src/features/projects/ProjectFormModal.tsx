import { useState } from 'react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'

export interface ProjectFormValues {
  title: string
  subtitle: string
  author: string
  year: string // stringa nel form, convertita a number|undefined all'invio
  description: string
  notes: string
  plot: string
  fabula: string
}

const EMPTY_VALUES: ProjectFormValues = {
  title: '',
  subtitle: '',
  author: '',
  year: '',
  description: '',
  notes: '',
  plot: '',
  fabula: ''
}

interface Props {
  initialValues?: Partial<ProjectFormValues>
  title: string // titolo del modale, es. "Nuovo progetto" / "Modifica progetto"
  submitLabel: string
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => void
}

export default function ProjectFormModal({
  initialValues,
  title,
  submitLabel,
  onClose,
  onSubmit
}: Props): JSX.Element {
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY_VALUES, ...initialValues })
  const [tab, setTab] = useState<'base' | 'struttura' | 'narrazione'>('base')

  const set = (patch: Partial<ProjectFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!values.title.trim()) return
    onSubmit(values)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
      >
        <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-800">
          {title}
        </h2>

        <div className="flex border-b border-gray-100 px-5">
          {(
            [
              ['base', 'Dati base'],
              ['struttura', 'Struttura'],
              ['narrazione', 'Narrazione']
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === key
                  ? 'border-blue-600 font-medium text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/*
          v0.3.9: altezza fissa (non più flex-1, che qui non aveva alcun
          contenitore con altezza propria da riempire: la modale si
          restringe/allarga in base al proprio contenuto, quindi "Dati base"
          — poche righe — e "Struttura"/"Narrazione" — due aree di testo —
          la facevano cambiare altezza ad ogni cambio scheda). overflow-auto
          resta, per il raro caso di contenuto comunque più alto del box.
        */}
        <div className="h-96 overflow-auto px-5 py-4">
          {tab === 'base' && (
            <div className="space-y-3">
              <Field label="Titolo *">
                <input
                  autoFocus
                  required
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Sottotitolo (opzionale)">
                <input
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.subtitle}
                  onChange={(e) => set({ subtitle: e.target.value })}
                />
              </Field>
              <div className="flex gap-3">
                <Field label="Autore" className="flex-1">
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    value={values.author}
                    onChange={(e) => set({ author: e.target.value })}
                  />
                </Field>
                <Field label="Anno (opzionale)" className="w-28">
                  <input
                    type="number"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    value={values.year}
                    onChange={(e) => set({ year: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          )}

          {tab === 'struttura' && (
            <div className="space-y-3">
              <Field label="Descrizione">
                <AutosizeTextarea
                  rows={4}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
              <Field label="Note">
                <AutosizeTextarea
                  rows={4}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </Field>
            </div>
          )}

          {tab === 'narrazione' && (
            <div className="space-y-3">
              <Field label="Trama">
                <AutosizeTextarea
                  rows={4}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.plot}
                  onChange={(e) => set({ plot: e.target.value })}
                />
              </Field>
              <Field label="Fabula">
                <AutosizeTextarea
                  rows={4}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={values.fabula}
                  onChange={(e) => set({ fabula: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Annulla
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
  className = ''
}: {
  label: string
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}
