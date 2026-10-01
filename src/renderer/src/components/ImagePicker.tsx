import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'

interface Props {
  imagePath: string | null | undefined
  onChange: (newPath: string) => void
}

/** Avatar/immagine caricabile: mostra l'immagine corrente (letta come data-URI dal main process) o un placeholder, con bottone per sceglierne una nuova. */
export default function ImagePicker({ imagePath, onChange }: Props): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!imagePath) {
      setDataUrl(null)
      return
    }
    window.mybook.media.readAsDataUrl(imagePath).then(setDataUrl)
  }, [imagePath])

  const pick = async () => {
    const newPath = await window.mybook.media.pickImage()
    if (newPath) onChange(newPath)
  }

  return (
    <button
      onClick={pick}
      title="Cambia immagine"
      className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50"
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImagePlus size={20} className="text-gray-300" />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 group-hover:opacity-100">
        Cambia
      </div>
    </button>
  )
}
