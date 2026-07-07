import type { StoredEvent, TurnEvent, SessionSnapshot } from '../events/types.js'
import type { Attachment } from '../../shared/types.js'
import { describeImageFromDataUrl } from '../llm/vision-fallback.js'
import type { VisionBackend } from '../llm/vision-fallback.js'
import { createHash } from 'node:crypto'
import { getRuntimeConfig } from '../runtime-config.js'

export async function loadVisionModelFromGlobalConfig(): Promise<
  { baseUrl: string; model: string; timeout: number; backend: VisionBackend } | undefined
> {
  try {
    const { loadGlobalConfig, getVisionFallback } = await import('../../cli/config.js')
    const runtimeConfig = getRuntimeConfig()
    const mode = runtimeConfig.mode ?? 'production'
    const globalConfig = await loadGlobalConfig(mode)
    const fallback = getVisionFallback(globalConfig)
    if (fallback?.enabled && fallback.model) {
      return {
        baseUrl: fallback.url,
        model: fallback.model,
        timeout: fallback.timeout * 1000,
        backend: fallback.backend ?? 'ollama',
      }
    }
  } catch {
    // Global config not available
  }
  return undefined
}

export interface ImageProcessorOptions {
  modelSupportsVision: boolean
  visionModel?: {
    baseUrl: string
    model: string
    timeout: number
    backend: VisionBackend
  }
  signal?: AbortSignal
  onEvent?: (event: TurnEvent) => void
  /** Called to persist enriched event data (e.g., attachment descriptions) back to the event store */
  persistEvent?: (sessionId: string, seq: number, data: unknown) => void
}

export interface ProcessContextResult {
  events: StoredEvent[]
  descriptions: Map<string, string>
}

const descriptionCache = new Map<string, string>()

export function clearImageDescriptionCache(): void {
  descriptionCache.clear()
}

function contentHash(data: string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

function isImageAttachment(att: Attachment): boolean {
  return att.mimeType.startsWith('image/')
}

function hasImageMetadata(result: { metadata?: Record<string, unknown> }): boolean {
  const meta = result.metadata
  if (!meta) return false
  const dataUrl = meta['dataUrl']
  const mimeType = meta['mimeType']
  return typeof dataUrl === 'string' && typeof mimeType === 'string' && (mimeType as string).startsWith('image/')
}

async function describeAttachment(
  att: Attachment,
  messageId: string,
  options: ImageProcessorOptions,
  descriptions: Map<string, string>,
): Promise<string> {
  const cacheKey = contentHash(att.data)
  if (descriptionCache.has(cacheKey)) {
    const cached = descriptionCache.get(cacheKey)!
    descriptions.set(att.id, cached)
    return cached
  }

  if (options.visionModel) {
    const startData: { messageId: string; attachmentId: string; filename?: string } = {
      messageId,
      attachmentId: att.id,
    }
    if (att.filename !== undefined) {
      startData.filename = att.filename
    }
    options.onEvent?.({ type: 'vision_fallback.start', data: startData })

    const description = await describeImageFromDataUrl(att.data, options.visionModel, {
      context: att.filename ? `File: ${att.filename}` : undefined,
      signal: options.signal,
    })

    descriptionCache.set(cacheKey, description)
    descriptions.set(att.id, description)

    options.onEvent?.({ type: 'vision_fallback.done', data: { messageId, attachmentId: att.id, description } })

    return description
  }

  const placeholder = `[Image: ${att.filename || 'image'}]`
  descriptions.set(att.id, placeholder)
  return placeholder
}

async function describeToolResultImage(
  dataUrl: string,
  filename: string | undefined,
  toolCallId: string,
  messageId: string,
  options: ImageProcessorOptions,
  descriptions: Map<string, string>,
): Promise<string> {
  const cacheKey = contentHash(dataUrl)
  if (descriptionCache.has(cacheKey)) {
    const cached = descriptionCache.get(cacheKey)!
    descriptions.set(toolCallId, cached)
    return cached
  }

  if (options.visionModel) {
    const startData: { messageId: string; attachmentId: string; filename?: string } = {
      messageId,
      attachmentId: toolCallId,
    }
    if (filename !== undefined) {
      startData.filename = filename
    }
    options.onEvent?.({ type: 'vision_fallback.start', data: startData })

    const description = await describeImageFromDataUrl(dataUrl, options.visionModel, {
      context: filename ? `File: ${filename}` : undefined,
      signal: options.signal,
    })

    descriptionCache.set(cacheKey, description)
    descriptions.set(toolCallId, description)

    options.onEvent?.({
      type: 'vision_fallback.done',
      data: { messageId, attachmentId: toolCallId, description },
    })

    return description
  }

  const placeholder = `[Image: ${filename || 'image'}]`
  descriptions.set(toolCallId, placeholder)
  return placeholder
}

/**
 * Enrich image attachments with vision fallback descriptions.
 *
 * Unlike the old approach (which replaced content and deleted attachments on clones),
 * this enriches attachments with a `description` field and persists the enriched data
 * back to the event store. The original image data and attachments array are kept intact
 * so the UI continues to display images.
 *
 * For non-vision models, the LLM context builder uses `attachment.description` instead
 * of the raw image data. For vision models, the description is ignored.
 */
export async function processContextImages(
  events: StoredEvent[],
  options: ImageProcessorOptions,
): Promise<ProcessContextResult> {
  if (options.modelSupportsVision) {
    return { events, descriptions: new Map() }
  }

  const descriptions = new Map<string, string>()
  const modifiedEvents: StoredEvent[] = events.map((event) => structuredClone(event))

  for (const event of modifiedEvents) {
    if (event.type === 'message.start') {
      const data = event.data as Extract<TurnEvent, { type: 'message.start' }>['data']
      if (!data.attachments || data.attachments.length === 0) continue

      const imageAtts = data.attachments.filter(isImageAttachment)
      if (imageAtts.length === 0) continue

      let enriched = false
      for (const att of imageAtts) {
        // Skip if already has a description (persisted from a previous run)
        if (att.description) {
          descriptions.set(att.id, att.description)
          continue
        }
        const description = await describeAttachment(att, data.messageId, options, descriptions)
        att.description = description
        enriched = true
      }

      // Persist enriched attachments back to the store
      if (enriched && options.persistEvent) {
        options.persistEvent(event.sessionId, event.seq, data)
      }
    }

    if (event.type === 'tool.result') {
      const data = event.data as Extract<TurnEvent, { type: 'tool.result' }>['data']
      if (!data.result.metadata || !hasImageMetadata(data.result)) continue

      const meta = data.result.metadata
      // Skip if already has a description
      if (meta['description']) {
        descriptions.set(data.toolCallId, meta['description'] as string)
        continue
      }

      const dataUrl = meta['dataUrl'] as string
      const path = meta['path'] as string | undefined

      const description = await describeToolResultImage(
        dataUrl,
        path,
        data.toolCallId,
        data.messageId,
        options,
        descriptions,
      )

      meta['description'] = description

      // Persist enriched metadata back to the store
      if (options.persistEvent) {
        options.persistEvent(event.sessionId, event.seq, data)
      }
    }

    if (event.type === 'turn.snapshot') {
      const snapshot = event.data as SessionSnapshot
      let enriched = false

      for (const message of snapshot.messages) {
        if (message.role === 'user' && message.attachments && message.attachments.length > 0) {
          const imageAtts = message.attachments.filter(isImageAttachment)
          if (imageAtts.length === 0) continue

          for (const att of imageAtts) {
            if (att.description) {
              descriptions.set(att.id, att.description)
              continue
            }
            const description = await describeAttachment(att, message.id, options, descriptions)
            att.description = description
            enriched = true
          }
        }

        if (message.role === 'assistant' && message.toolCalls) {
          for (const toolCall of message.toolCalls) {
            if (!toolCall.result || !toolCall.result.metadata || !hasImageMetadata(toolCall.result)) continue

            const meta = toolCall.result.metadata
            if (meta['description']) {
              descriptions.set(toolCall.id, meta['description'] as string)
              continue
            }

            const dataUrl = meta['dataUrl'] as string
            const path = meta['path'] as string | undefined

            const description = await describeToolResultImage(
              dataUrl,
              path,
              toolCall.id,
              message.id,
              options,
              descriptions,
            )

            meta['description'] = description
            enriched = true
          }
        }
      }

      // Persist enriched snapshot back to the store
      if (enriched && options.persistEvent) {
        options.persistEvent(event.sessionId, event.seq, snapshot)
      }
    }
  }

  return { events: modifiedEvents, descriptions }
}
