"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class WhatsAppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("DEBUG - ERROR DETECTADO:", error)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          backgroundColor: 'white', 
          color: 'red', 
          padding: '20px', 
          fontSize: '20px', 
          fontWeight: 'bold',
          wordBreak: 'break-all',
          zIndex: 9999,
          position: 'relative',
          border: '5px solid red'
        }}>
          <h1>⚠️ ERROR DETECTADO EN EL CHAT:</h1>
          <p>Mensaje: {this.state.error?.message}</p>
          <hr />
          <pre style={{ fontSize: '12px', color: 'black' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }

    return this.children
  }
}
