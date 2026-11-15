import { Component, type ReactNode } from 'react'

interface SceneBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: () => void
}

/** Keeps a failed 3D chunk or WebGL error from taking down the interface. */
export class SceneBoundary extends Component<SceneBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError?.()
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
