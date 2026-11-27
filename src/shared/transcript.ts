import type { ChatMessage } from './types'

/**
 * Markdown transcript of one planning session: the whole content of an export
 * file. Assistant turns name the model that produced them, so the transcript
 * stays honest about who wrote what.
 */
export function chatTranscriptMarkdown(title: string, messages: ChatMessage[]): string {
  const lines = [`# ${title || 'Planning session'}`, '', `Exported ${new Date().toISOString().slice(0, 10)}`, '']
  for (const m of messages) {
    const who = m.role === 'owner' ? 'You' : m.model ? `Assistant (${m.model})` : 'Assistant'
    lines.push(`## ${who}`, '', m.content.trimEnd(), '')
  }
  return lines.join('\n')
}
