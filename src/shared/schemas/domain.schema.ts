import { z } from 'zod'
import { isValidIsoDate } from '../calendarDate'

export const Uuid = z.string().uuid()
export const IdInput = z.object({ id: Uuid })
export const ProjectIdInput = z.object({ projectId: Uuid })

const CustomField = z.object({ label: z.string(), value: z.string() })

export const CharacterCreateInput = z.object({ projectId: Uuid, name: z.string().trim().min(1) })
export const CharacterUpdateInput = z.object({
  id: Uuid,
  fields: z.object({
    name: z.string().trim().min(1).optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    avatar_path: z.string().nullable().optional(),
    notes: z.string().optional(),
    custom_fields: z.array(CustomField).optional(),
    tags: z.string().optional(),
    color: z.string().optional(),
    group_name: z.string().optional()
  }).strict()
})

export const LocationCreateInput = z.object({
  projectId: Uuid,
  name: z.string().trim().min(1),
  parentId: Uuid.nullable().optional()
})
export const LocationUpdateInput = z.object({
  id: Uuid,
  fields: z.object({
    parent_id: Uuid.nullable().optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    image_path: z.string().nullable().optional(),
    notes: z.string().optional(),
    custom_fields: z.array(CustomField).optional(),
    tags: z.string().optional(),
    color: z.string().optional(),
    group_name: z.string().optional()
  }).strict()
})


export const ObjectCreateInput = z.object({ projectId: Uuid, name: z.string().trim().min(1) })
export const ObjectUpdateInput = z.object({
  id: Uuid,
  fields: z.object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    image_path: z.string().nullable().optional(),
    notes: z.string().optional(),
    custom_fields: z.array(CustomField).optional(),
    tags: z.string().optional(),
    color: z.string().optional(),
    group_name: z.string().optional()
  }).strict()
})

export const TimelineIdInput = z.object({ timelineId: Uuid })
export const TimelineCreateInput = z.object({ projectId: Uuid, name: z.string().trim().min(1) })
export const TimelineRenameInput = z.object({ id: Uuid, name: z.string().trim().min(1) })
export const TimelineEventCreateInput = z.object({ projectId: Uuid, timelineId: Uuid, title: z.string().trim().min(1) })
export const TimelineEventUpdateInput = z.object({
  id: Uuid,
  fields: z.object({
    timeline_id: Uuid.nullable().optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    event_date: z.string().optional(),
    // v0.3.4: data da calendario, ISO "AAAA-MM-GG" esistente oppure "" (non impostata).
    calendar_date: z.string().refine((v) => v === '' || isValidIsoDate(v), 'Data non valida').optional(),
    order_index: z.number().int().min(0).optional(),
    notes: z.string().optional(),
    color: z.string().optional()
  }).strict()
})
export const ReorderIdsInput = z.object({ orderedIds: z.array(Uuid).max(10000) })

export const MindmapIdInput = z.object({ mindmapId: Uuid })
export const MindmapCreateInput = z.object({ projectId: Uuid, name: z.string().trim().min(1) })
export const MindmapRenameInput = z.object({ id: Uuid, name: z.string().trim().min(1) })
export const MindmapNodeCreateInput = z.object({
  projectId: Uuid,
  mindmapId: Uuid,
  nodeType: z.enum(['character', 'location', 'object', 'event', 'chapter', 'scene', 'free_note', 'group']),
  refId: Uuid.nullable().optional(),
  label: z.string().default(''),
  description: z.string().optional(),
  groupId: Uuid.nullable().optional(),
  posX: z.number().finite().default(0),
  posY: z.number().finite().default(0),
  color: z.string().optional()
})
export const MindmapNodeUpdateInput = z.object({
  id: Uuid,
  fields: z.object({
    node_type: z.enum(['character', 'location', 'object', 'event', 'chapter', 'scene', 'free_note', 'group']).optional(),
    ref_id: Uuid.nullable().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    group_id: Uuid.nullable().optional(),
    pos_x: z.number().finite().optional(),
    pos_y: z.number().finite().optional(),
    color: z.string().optional()
  }).strict()
})
export const MindmapEdgeCreateInput = z.object({
  projectId: Uuid,
  mindmapId: Uuid,
  sourceNodeId: Uuid,
  targetNodeId: Uuid,
  label: z.string().optional()
})

export const RevisionCompareInput = z.object({ revisionIdA: Uuid, revisionIdB: Uuid })
