import { Mark, Node, Extension, mergeAttributes } from '@tiptap/core'

export const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return { size: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[style*="font-size"]', getAttrs: (el) => ({ size: (el as HTMLElement).style.fontSize }) }]
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes } as Record<string, any>
    const size = attrs.size
    delete attrs.size
    return ['span', mergeAttributes(attrs, { style: `font-size:${size}` }), 0]
  }
})

export const LinkMark = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return { href: { default: null }, target: { default: '_blank' } }
  },
  parseHTML() {
    return [{ tag: 'a[href]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { rel: 'noopener noreferrer', class: 'text-blue-600 underline' }), 0]
  }
})

export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: '' }, title: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'img[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'mybook-editor-image' })]
  }
})

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (element) => (element as HTMLElement).style.lineHeight || null,
          renderHTML: (attributes) => attributes.lineHeight ? { style: `line-height:${attributes.lineHeight}` } : {}
        }
      }
    }]
  }
})

/**
 * Commento ancorato a un intervallo di testo. Il testo del commento vive
 * nella tabella scene_comments (vedi comment.repository.ts); questo mark
 * porta solo l'id che li collega. `inclusive: false` evita che digitando
 * subito dopo il testo commentato il nuovo testo erediti il commento.
 */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  addAttributes() {
    return { commentId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]', getAttrs: (el) => ({ commentId: (el as HTMLElement).getAttribute('data-comment-id') }) }]
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes } as Record<string, any>
    const commentId = attrs.commentId
    delete attrs.commentId
    return ['span', mergeAttributes(attrs, { 'data-comment-id': commentId, class: 'mybook-comment' }), 0]
  }
})

/**
 * Tag verso un'altra sezione del progetto (Personaggio/Località/Oggetto/
 * Evento). Porta tipo+id dell'entità referenziata; il nome mostrato e la
 * navigazione al click sono risolti nel renderer (vedi EntityTagView in
 * SceneEditor.tsx), non salvati qui, così restano sempre aggiornati anche
 * se l'entità viene rinominata altrove.
 */
export const EntityTagMark = Mark.create({
  name: 'entityTag',
  inclusive: false,
  addAttributes() {
    return { entityType: { default: null }, entityId: { default: null } }
  },
  parseHTML() {
    return [{
      tag: 'span[data-entity-type][data-entity-id]',
      getAttrs: (el) => ({
        entityType: (el as HTMLElement).getAttribute('data-entity-type'),
        entityId: (el as HTMLElement).getAttribute('data-entity-id')
      })
    }]
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes } as Record<string, any>
    const entityType = attrs.entityType
    const entityId = attrs.entityId
    delete attrs.entityType
    delete attrs.entityId
    return [
      'span',
      mergeAttributes(attrs, {
        'data-entity-type': entityType,
        'data-entity-id': entityId,
        class: `mybook-entity-tag mybook-entity-tag--${entityType}`
      }),
      0
    ]
  }
})
