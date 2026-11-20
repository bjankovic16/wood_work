import { Component, type ReactNode } from 'react';

export class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

let supported: boolean | undefined;
export function canShowModel() {
  if (supported === undefined) {
    const gl = document.createElement('canvas').getContext('webgl2');
    supported = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return supported;
}
