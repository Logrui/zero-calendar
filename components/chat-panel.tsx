"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Loader2, XCircle, DownloadIcon, X, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ReactMarkdown from "react-markdown"

type Message = {
  role: "user" | "assistant"
  content: string
  id?: string
}

interface ChatPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onToolExecution?: (result: any) => void
}

export function ChatPanel({ open, onOpenChange, onToolExecution }: ChatPanelProps) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your calendar assistant. How can I help you today?",
      id: "welcome-" + Date.now(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string>(() => {

    return "conv-" + Date.now()
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    const savedMessages = localStorage.getItem(`chatMessages-${conversationId}`)
    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages)
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          setMessages(parsedMessages)
        }
      } catch (error) {
        console.error("Error parsing saved messages:", error)
      }
    }
  }, [conversationId])


  useEffect(() => {
    if (messages.length > 1) {

      localStorage.setItem(`chatMessages-${conversationId}`, JSON.stringify(messages))
    }
  }, [messages, conversationId])

  useEffect(() => {
    scrollToBottom()


    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [messages, open])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }


  const getConversationHistory = () => {

    return messages.map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`).join("\n\n")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !session?.user?.id) return

    const userMessage = input.trim()
    setInput("")
    setError(null)


    const userMessageObj: Message = {
      role: "user",
      content: userMessage,
      id: "user-" + Date.now(),
    }
    setMessages((prev) => [...prev, userMessageObj])


    setIsLoading(true)


    const assistantMessageId = "assistant-" + Date.now()
    const assistantPlaceholder: Message = { role: "assistant", content: "Thinking...", id: assistantMessageId }
    setMessages((prev) => [...prev, assistantPlaceholder])

    try {

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          history: getConversationHistory(),
          conversationId: conversationId,
        }),
        signal: controller.signal,
      }).catch((err) => {
        if (err.name === "AbortError") {
          throw new Error("Request timed out")
        }
        throw err
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to get AI response: ${response.status}`)
      }

      const data = await response.json()


      setMessages((prev) => {
        const newMessages = [...prev]
        const lastMessage = newMessages[newMessages.length - 1]
        if (lastMessage.role === "assistant" && lastMessage.id === assistantMessageId) {
          lastMessage.content =
            data.response || "I'm not sure how to respond to that. Could you try asking in a different way?"
        }
        return newMessages
      })


      if (onToolExecution && data.usedTools) {
        onToolExecution({ success: true })
      }
    } catch (error) {
      console.error("Error in chat:", error)

      setMessages((prev) => {
        const newMessages = [...prev]
        const lastMessage = newMessages[newMessages.length - 1]
        if (lastMessage.role === "assistant" && lastMessage.id === assistantMessageId) {
          if (error instanceof Error && error.message === "Request timed out") {
            lastMessage.content =
              "I'm sorry, the request took too long to process. Let me try a simpler response: How can I help with your calendar today?"
          } else {
            lastMessage.content = "I'm sorry, I encountered an error. Please try again."
          }
        }
        return newMessages
      })
      setError("Failed to get a response. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const clearConversation = () => {

    const newConversationId = "conv-" + Date.now()
    setConversationId(newConversationId)


    setMessages([
      {
        role: "assistant",
        content: "Hi! I'm your calendar assistant. How can I help you today?",
        id: "welcome-" + Date.now(),
      },
    ])

    setError(null)


    localStorage.removeItem(`chatMessages-${conversationId}`)
  }

  const downloadConversation = () => {
    const conversationText = messages
      .map((msg) => `${msg.role === "user" ? "You" : "Assistant"}: ${msg.content}`)
      .join("\n\n")

    const blob = new Blob([conversationText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `calendar-conversation-${conversationId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="fixed inset-y-0 right-0 w-full max-w-md border-l border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-lg font-semibold">Calendar Assistant</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={downloadConversation}
                title="Download conversation"
                className="h-8 w-8 rounded-full"
              >
                <DownloadIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearConversation}
                title="Clear conversation"
                className="h-8 w-8 rounded-full"
              >
                <XCircle className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleClose} title="Close" className="h-8 w-8 rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your calendar..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  )
}
