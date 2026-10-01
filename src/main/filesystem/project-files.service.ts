import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { v4 as uuid } from 'uuid'

/**
 * Gestisce gli asset binari collegati al progetto (immagini di personaggi/
 * località) che non hanno senso come BLOB in SQLite: vengono copiati nella
 * userData directory e referenziati per percorso relativo nelle tabelle
 * characters.avatar_path / locations.image_path.
 */
export class ProjectFilesService {
  private assetsDir(projectId: string): string {
    const dir = path.join(app.getPath('userData'), 'MyBook', 'assets', projectId)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  importImage(projectId: string, sourcePath: string): string {
    const ext = path.extname(sourcePath)
    const filename = `${uuid()}${ext}`
    const destPath = path.join(this.assetsDir(projectId), filename)
    fs.copyFileSync(sourcePath, destPath)
    return destPath
  }

  deleteAsset(assetPath: string): void {
    if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath)
  }
}
