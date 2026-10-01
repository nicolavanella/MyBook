import { v4 as uuid } from 'uuid'
import type { ProjectRepository } from '../database/repositories/project.repository'
import type { ProjectDuplicationService } from './project-duplication.service'
import type { CreateProjectInput, UpdateProjectInput } from '@shared/schemas/document.schema'

export class ProjectService {
  constructor(
    private repo: ProjectRepository,
    private duplicationService: ProjectDuplicationService
  ) {}

  list() {
    return this.repo.list()
  }

  listWithStats() {
    return this.repo.listWithStats()
  }

  findById(id: string) {
    return this.repo.findById(id)
  }

  touch(id: string) {
    this.repo.touch(id)
  }

  /** v0.3.9: dove riaprire il progetto (sezione, ed eventualmente scena) — vedi MainLayout.tsx. */
  getUiState(id: string): Record<string, unknown> {
    return this.repo.getUiState(id)
  }

  setUiState(id: string, patch: Record<string, unknown>): void {
    this.repo.setUiState(id, patch)
  }

  create(input: CreateProjectInput) {
    const id = uuid()
    this.repo.insert({
      id,
      title: input.title,
      subtitle: input.subtitle ?? '',
      author: input.author ?? null,
      year: input.year ?? null,
      description: input.description ?? '',
      notes: input.notes ?? '',
      plot: input.plot ?? '',
      fabula: input.fabula ?? ''
    })
    return this.repo.findById(id)
  }

  update(input: UpdateProjectInput) {
    this.repo.update(input.id, input.fields)
    return this.repo.findById(input.id)
  }

  duplicate(id: string) {
    const newId = this.duplicationService.duplicate(id)
    return this.repo.findById(newId)
  }

  delete(id: string) {
    this.repo.delete(id)
  }
}
