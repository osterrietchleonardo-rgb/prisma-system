"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class SimpleErrorCatcher extends Component<Props, State> {
  public state: State = {
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("DEBUG ERROR:", error, errorInfo)
  }

  public render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '20px', background: 'white', color: 'red', position: 'fixed', inset: 0, zIndex: 9999, overflow: 'auto' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>ERROR DETECTADO EN MÓVIL:</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '14px', marginTop: '10px' }}>
            {this.state.error.message}
          </pre>
          <hr style={{ margin: '15px 0' }} />
          <pre style={{ fontSize: '10px', color: '#666' }}>
            {this.state.error.stack}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}
