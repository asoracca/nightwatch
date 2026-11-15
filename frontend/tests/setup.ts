import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
// jsdom has no GPU: exercise the supported non-WebGL fallback without canvas warnings.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
