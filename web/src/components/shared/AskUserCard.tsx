import { useState, useRef, useEffect, useCallback } from 'react'
import type { ToolCall } from '@shared/types.js'
import { useSessionStore, type PendingQuestion } from '../../stores/session'

interface AskUserCardProps {
  toolCall: ToolCall
}

export function AskUserCard({ toolCall }: AskUserCardProps) {
  const pendingQuestions = useSessionStore((state) => state.pendingQuestions)
  const answerQuestion = useSessionStore((state) => state.answerQuestion)
  const [answer, setAnswer] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const pendingQuestion: PendingQuestion | undefined = pendingQuestions.find((q) => q.callId === toolCall.id)

  const question = (toolCall.arguments['question'] as string | undefined) ?? pendingQuestion?.question ?? ''
  const type =
    (toolCall.arguments['type'] as 'text' | 'confirm' | 'choice' | undefined) ?? pendingQuestion?.type ?? 'text'
  const options = (toolCall.arguments['options'] as string[] | undefined) ?? pendingQuestion?.options ?? undefined

  const hasResult = toolCall.result !== undefined
  const isPending = pendingQuestion !== undefined && !hasResult

  const resultText = toolCall.result?.output ?? ''
  const isSkipped = resultText === '[user skipped]'

  useEffect(() => {
    if (isPending && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isPending])

  useEffect(() => {
    if (isPending && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isPending])

  const handleSubmit = useCallback(() => {
    if (!pendingQuestion) return
    answerQuestion(pendingQuestion.callId, answer)
  }, [pendingQuestion, answer, answerQuestion])

  const handleSkip = useCallback(() => {
    if (!pendingQuestion) return
    answerQuestion(pendingQuestion.callId, '', true)
  }, [pendingQuestion, answerQuestion])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape' && !e.shiftKey) {
        e.preventDefault()
        handleSkip()
      }
    },
    [handleSubmit, handleSkip],
  )

  const handleOptionSelect = useCallback(
    (option: string) => {
      if (!pendingQuestion) return
      answerQuestion(pendingQuestion.callId, option)
    },
    [pendingQuestion, answerQuestion],
  )

  const btnBase = 'px-3 py-1.5 text-xs font-medium rounded transition-colors'

  if (hasResult || !isPending) {
    return (
      <div className="border border-border rounded overflow-hidden my-1">
        <div className="flex items-center gap-2 p-3 bg-bg-secondary">
          <span className="text-accent-primary text-sm font-medium">Question</span>
          <span className="text-xs text-text-muted flex-1 truncate">{question}</span>
          {hasResult && (
            <span className={`text-xs ${isSkipped ? 'text-amber-400' : 'text-accent-success'}`}>
              {isSkipped ? 'Skipped' : 'Answered'}
            </span>
          )}
        </div>
        {hasResult && !isSkipped && resultText && (
          <div className="px-3 pb-3 bg-bg-secondary">
            <div className="text-xs text-text-secondary bg-bg-primary rounded p-2">{resultText}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="border border-border rounded overflow-hidden my-1 animate-fade-in">
      <div className="p-3 bg-bg-secondary border-b border-border">
        <div className="text-sm text-text-primary">{question}</div>
      </div>

      <div className="p-3 bg-primary space-y-2">
        {type === 'confirm' ? (
          <div className="flex gap-2">
            <button
              onClick={() => handleOptionSelect('yes')}
              className={`${btnBase} flex-1 bg-accent-success/20 hover:bg-accent-success/30 text-accent-success border border-accent-success/30`}
            >
              Yes
            </button>
            <button
              onClick={() => handleOptionSelect('no')}
              className={`${btnBase} flex-1 bg-accent-error/20 hover:bg-accent-error/30 text-accent-error border border-accent-error/30`}
            >
              No
            </button>
            <button
              onClick={handleSkip}
              className={`${btnBase} bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary border border-border`}
            >
              Skip
            </button>
          </div>
        ) : type === 'choice' && options && options.length > 0 ? (
          <>
            <div className="flex flex-col gap-1.5">
              {options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleOptionSelect(option)}
                  className={`${btnBase} text-left w-full bg-bg-tertiary hover:bg-accent-primary/20 text-text-primary border border-border hover:border-accent-primary/50`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Or type your own answer... (Enter to submit)"
                className="flex-1 min-h-[36px] max-h-[80px] px-2 py-1.5 bg-bg-tertiary border border-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 resize-y"
                rows={1}
              />
              <button
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className={`${btnBase} bg-accent-primary/25 hover:bg-accent-primary/40 text-text-primary disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Send
              </button>
              <button
                onClick={handleSkip}
                className={`${btnBase} bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary border border-border`}
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer here... (Enter to submit, Shift+Enter for new line)"
              className="w-full min-h-[80px] px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50 resize-y"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleSkip}
                className={`${btnBase} bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary border border-border`}
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className={`${btnBase} bg-accent-primary/25 hover:bg-accent-primary/40 text-text-primary disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Send Answer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
